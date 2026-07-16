import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { sendGhlSms } from "@/lib/ghl";

const DAY = 86400000;

const FOLLOWUP_DELAY_DAYS = (() => {
  const raw = process.env.JOB_FOLLOWUP_DELAY_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2;
})();

export type FollowUpSendResult = {
  sent: number;
  autoResolvedNotClosed: number;
  autoResolvedClosed: number;
  skippedNoContact: number;
  failed: number;
};

/**
 * Finds appointments ready for a job-closed follow-up and either sends the
 * SMS or auto-resolves the obvious non-jobs without texting anyone. Fully
 * niche-agnostic — the SMS wording never mentions a specific trade, only
 * the account name (which carries whatever niche it belongs to).
 */
export async function sendJobFollowUps(
  supabase: SupabaseClient<Database>,
): Promise<FollowUpSendResult> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cutoffDate = new Date(now - FOLLOWUP_DELAY_DAYS * DAY).toISOString().slice(0, 10);

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, lead_id, status, appointment_date, account:accounts(name)")
    .is("job_closed", null)
    .is("follow_up_sent_at", null)
    .not("appointment_date", "is", null)
    .lte("appointment_date", cutoffDate);

  const result: FollowUpSendResult = {
    sent: 0,
    autoResolvedNotClosed: 0,
    autoResolvedClosed: 0,
    skippedNoContact: 0,
    failed: 0,
  };

  for (const a of appts ?? []) {
    // No-shows/cancellations obviously didn't become a job — resolve
    // without spending a text on it.
    if (a.status === "no_show" || a.status === "cancelled") {
      await supabase
        .from("appointments")
        .update({ job_closed: false, closed_recorded_at: nowIso })
        .eq("id", a.id);
      result.autoResolvedNotClosed++;
      continue;
    }
    // Legacy 'closed' status predates job_closed/the follow-up loop, but
    // already means the same thing insights.ts's resolvedJobStatus()
    // treats it as: a closed job, just with no revenue figure attached.
    // Auto-resolve it the same way rather than leaving it stuck forever
    // (it's not 'showed', so the loop below would otherwise skip it with
    // no path to ever getting job_closed set).
    if (a.status === "closed") {
      await supabase
        .from("appointments")
        .update({ job_closed: true, closed_recorded_at: nowIso })
        .eq("id", a.id);
      result.autoResolvedClosed++;
      continue;
    }
    // Only appointments that actually happened are worth asking about.
    if (a.status !== "showed") continue;

    const { data: lead } = await supabase
      .from("leads")
      .select("ghl_contact_id")
      .eq("id", a.lead_id)
      .maybeSingle();
    if (!lead?.ghl_contact_id) {
      result.skippedNoContact++;
      continue;
    }

    const accountName = (a.account as { name: string } | null)?.name ?? "your recent appointment";
    const message = `Hi! Quick follow-up on the ${accountName} appointment on ${a.appointment_date} — did it turn into a job, and roughly what was it worth? Reply e.g. "Yes $2400" or "No".`;

    try {
      await sendGhlSms(lead.ghl_contact_id, message);
      await supabase.from("appointments").update({ follow_up_sent_at: nowIso }).eq("id", a.id);
      result.sent++;
    } catch {
      // Leave follow_up_sent_at null so the next scheduled run retries.
      result.failed++;
    }
  }

  return result;
}

export type ParsedJobReply = { closed: boolean; revenue: number | null };

// "yes"/"no" (and casual variants) must lead the reply — a stray "yes" deep
// in an unrelated sentence shouldn't be read as an answer to this question.
const YES_RE = /^\s*(y|yes|yeah|yep|yup|closed|won|sold)\b/i;
const NO_RE = /^\s*(n|no|nope|nah|didn'?t|did not|lost|declined)\b/i;
// Requires an actual digit — bare "$" or "k" with nothing else never matches.
const AMOUNT_RE = /\$?\s*([\d,]+(?:\.\d+)?)\s*(k\b)?/i;

/** Lightweight regex parse, not an AI call — this is a 1-2 word SMS reply,
 * not worth a Claude round trip. Returns null when the reply doesn't
 * clearly start with a yes/no, so an ambiguous text is left unrecorded
 * rather than guessed at. */
export function parseJobReply(text: string): ParsedJobReply | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let closed: boolean | null = null;
  if (YES_RE.test(trimmed)) closed = true;
  else if (NO_RE.test(trimmed)) closed = false;
  if (closed === null) return null;

  let revenue: number | null = null;
  if (closed) {
    const m = trimmed.match(AMOUNT_RE);
    if (m && /\d/.test(m[1])) {
      const raw = parseFloat(m[1].replace(/,/g, ""));
      revenue = m[2] ? raw * 1000 : raw;
    }
  }
  return { closed, revenue };
}

export type RecordReplyResult = { appointmentId: string; parsed: ParsedJobReply | null };

/** Matches an inbound SMS reply (by the GHL contact who sent it) back to
 * that contact's most recent still-pending follow-up, and records the
 * parsed answer. Returns null if no matching lead/pending appointment is
 * found (e.g. a reply that arrives after the window, or from an unrelated
 * contact). */
export async function recordJobReply(
  supabase: SupabaseClient<Database>,
  ghlContactId: string,
  messageText: string,
): Promise<RecordReplyResult | null> {
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("ghl_contact_id", ghlContactId)
    .maybeSingle();
  if (!lead) return null;

  const { data: appt } = await supabase
    .from("appointments")
    .select("id")
    .eq("lead_id", lead.id)
    .is("job_closed", null)
    .not("follow_up_sent_at", "is", null)
    .order("appointment_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!appt) return null;

  const parsed = parseJobReply(messageText);
  if (!parsed) return { appointmentId: appt.id, parsed: null };

  await supabase
    .from("appointments")
    .update({
      job_closed: parsed.closed,
      job_revenue: parsed.revenue,
      closed_recorded_at: new Date().toISOString(),
    })
    .eq("id", appt.id);

  return { appointmentId: appt.id, parsed };
}
