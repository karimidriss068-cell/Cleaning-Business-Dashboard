import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { GhlError, type GhlClient } from "@/lib/ghl/client";
import type { GhlContact, GhlMessage, GhlOpportunity, Notification } from "@/lib/ghl/schemas";
import { consentFlags, opportunityPatch, parseStageIds, serviceFromTags, stageFromOpportunity, utmFromContact, type LeadStage } from "@/lib/ghl/mapping";
import { decideSend, nextSendTime, renderTemplate, templateVars, type TemplateKey } from "@/lib/ghl/send-rules";
import { appUrl } from "@/lib/stripe";

type Db = SupabaseClient<Database>;

// Inbound and outbound GHL work. Everything inbound funnels through the same service-role
// database functions (idempotent), whether it started as a webhook or as the reconciliation,
// and always acts on the record fetched from GHL by id, never on a webhook body.

function fail(op: string, error: { message: string }): never {
  // Database messages from these functions carry no contact details.
  throw new Error(`${op} failed: ${error.message.slice(0, 160)}`);
}

export type Outcome = { handled: string; createdLead?: boolean };

function jsonOf(value: Record<string, string | null>): Json {
  return value;
}

/** Upserts the contact and its open lead from a fetched GHL contact. */
export async function upsertFromContact(db: Db, contact: GhlContact, opportunityId: string | null): Promise<Outcome> {
  const flags = consentFlags(contact);
  const { data, error } = await db.rpc("ghl_upsert_lead", {
    p_ghl_contact_id: contact.id,
    p_first_name: contact.firstName ?? "",
    p_last_name: contact.lastName ?? "",
    p_phone: contact.phone ?? "",
    p_email: contact.email ?? "",
    p_source: contact.source ?? undefined,
    p_utm: jsonOf(utmFromContact(contact)),
    p_opportunity_id: opportunityId ?? undefined,
    p_service_type: serviceFromTags(contact.tags) ?? undefined,
    p_sms_consent: flags.smsConsent,
    p_dnd: flags.dnd,
  });
  if (error) {
    // A contact with no usable phone or email can't become a lead; retrying won't change that.
    if (error.code === "KC005") return { handled: "skipped: contact has no valid phone or email" };
    fail("Saving the GHL contact", error);
  }
  const created = typeof data === "object" && data !== null && !Array.isArray(data) && data.created_lead === true;
  return { handled: created ? "lead created" : "lead updated", createdLead: created };
}

async function applyOpportunity(db: Db, opp: GhlOpportunity): Promise<Outcome> {
  const { data: settings, error: sErr } = await db.from("ghl_settings").select("stage_ids").eq("id", true).single();
  if (sErr) fail("Reading GHL settings", sErr);
  const stage = stageFromOpportunity(opp, parseStageIds(settings.stage_ids));
  if (!stage) return { handled: "skipped: stage is not mapped" };
  const { data, error } = await db.rpc("ghl_apply_stage", {
    p_opportunity_id: opp.id,
    p_stage: stage,
    p_lost_reason: opp.lostReason ?? undefined,
  });
  if (error) fail("Applying the GHL stage", error);
  const applied = typeof data === "object" && data !== null && !Array.isArray(data) && data.applied === true;
  return { handled: applied ? `stage ${stage}` : "stage unchanged" };
}

async function logMessage(db: Db, msg: GhlMessage, contactGhlId: string): Promise<Outcome> {
  const type = (msg.messageType ?? "").toUpperCase();
  if (type && !type.includes("SMS") && type !== "TYPE_SMS") return { handled: "skipped: not a text" };
  const direction = (msg.direction ?? "").toLowerCase() === "outbound" ? "outbound" : "inbound";
  // Did we send it? A template send is recorded in message_log before the webhook arrives.
  const { data: ours } = await db.from("message_log").select("id").eq("ghl_message_id", msg.id).maybeSingle();
  const automated = ours !== null || (msg.source ?? "").toLowerCase() === "api";
  const { data, error } = await db.rpc("ghl_log_message", {
    p_ghl_contact_id: contactGhlId,
    p_message_id: msg.id,
    p_direction: direction,
    p_body: msg.body ?? "",
    p_at: msg.dateAdded ?? new Date().toISOString(),
    p_automated: automated,
  });
  if (error) fail("Logging the GHL message", error);
  const logged = typeof data === "object" && data !== null && !Array.isArray(data) && data.logged === true;
  return { handled: logged ? `${direction} text logged` : "text already logged" };
}

/** Acts on one webhook notification by fetching the record it names. */
export async function handleNotification(db: Db, client: GhlClient, n: Notification): Promise<Outcome> {
  if (n.event === "contact") {
    const contact = await client.getContact(n.contactId ?? "");
    if (!contact) return { handled: "skipped: contact not found in GHL" };
    const opp = await client.opportunityForContact(contact.id);
    return upsertFromContact(db, contact, opp?.id ?? null);
  }
  if (n.event === "opportunity") {
    const opp = await client.getOpportunity(n.opportunityId ?? "");
    if (!opp) return { handled: "skipped: opportunity not found in GHL" };
    let created = false;
    if (opp.contactId) {
      const contact = await client.getContact(opp.contactId);
      if (contact) created = (await upsertFromContact(db, contact, opp.id)).createdLead === true;
    }
    const stage = await applyOpportunity(db, opp);
    return { handled: stage.handled, createdLead: created };
  }
  if (n.event === "message") {
    const msg = await client.getMessage(n.messageId ?? "");
    if (!msg?.contactId) return { handled: "skipped: message not found in GHL" };
    let created = false;
    const known = await db.from("contacts").select("id").eq("ghl_contact_id", msg.contactId).maybeSingle();
    if (!known.data && (msg.direction ?? "").toLowerCase() !== "outbound") {
      const contact = await client.getContact(msg.contactId);
      if (contact) created = (await upsertFromContact(db, contact, null)).createdLead === true;
    }
    return { ...(await logMessage(db, msg, msg.contactId)), createdLead: created };
  }
  const appt = await client.getAppointment(n.appointmentId ?? "");
  if (!appt?.contactId || !appt.startTime) return { handled: "skipped: appointment not found in GHL" };
  const known = await db.from("contacts").select("id").eq("ghl_contact_id", appt.contactId).maybeSingle();
  if (!known.data) {
    const contact = await client.getContact(appt.contactId);
    if (contact) await upsertFromContact(db, contact, null);
  }
  const start = new Date(appt.startTime);
  const end = appt.endTime ? new Date(appt.endTime) : new Date(start.getTime() + 3 * 3600_000);
  if (Number.isNaN(start.getTime())) return { handled: "skipped: appointment has no valid time" };
  const { error } = await db.rpc("ghl_log_appointment", {
    p_appointment_id: appt.id,
    p_ghl_contact_id: appt.contactId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_status: appt.appointmentStatus ?? appt.status ?? "booked",
  });
  if (error) fail("Logging the GHL appointment", error);
  return { handled: "appointment logged" };
}

// ---------------------------------------------------------------------------
// Reconciliation: catches what the webhooks missed, through the same upserts.
// ---------------------------------------------------------------------------

export const RECONCILE_OVERLAP_MS = 15 * 60_000;
export const RECONCILE_LOOKBACK_MS = 48 * 3600_000;
export const RECONCILE_MAX = 100;

export type ReconcileResult = { contacts: number; opportunities: number; messages: number; leadsCreated: number; errors: number };

export async function reconcile(db: Db, client: GhlClient, now: Date): Promise<ReconcileResult> {
  const { data: settings, error } = await db.from("ghl_settings").select("last_reconcile_at").eq("id", true).single();
  if (error) fail("Reading GHL settings", error);
  const last = settings.last_reconcile_at ? Date.parse(settings.last_reconcile_at) : now.getTime() - RECONCILE_LOOKBACK_MS;
  const since = new Date(Math.max(last - RECONCILE_OVERLAP_MS, now.getTime() - RECONCILE_LOOKBACK_MS));
  const result: ReconcileResult = { contacts: 0, opportunities: 0, messages: 0, leadsCreated: 0, errors: 0 };
  const guarded = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch (e) {
      if (e instanceof GhlError && !e.retryable) return;
      result.errors += 1;
    }
  };

  for (const contact of await client.recentContacts(since, RECONCILE_MAX)) {
    await guarded(async () => {
      const flags = consentFlags(contact);
      const { data: known, error: kErr } = await db.rpc("ghl_refresh_contact", {
        p_ghl_contact_id: contact.id, p_phone: contact.phone ?? undefined, p_email: contact.email ?? undefined,
        p_sms_consent: flags.smsConsent, p_dnd: flags.dnd,
      });
      if (kErr) fail("Refreshing a GHL contact", kErr);
      // A contact we have never seen is a lead the webhook missed.
      const added = Date.parse(contact.dateAdded ?? "");
      if (known === false && !Number.isNaN(added) && added >= since.getTime()) {
        const opp = await client.opportunityForContact(contact.id);
        const out = await upsertFromContact(db, contact, opp?.id ?? null);
        if (out.createdLead) result.leadsCreated += 1;
      }
      result.contacts += 1;
    });
  }
  for (const opp of await client.recentOpportunities(since, RECONCILE_MAX)) {
    await guarded(async () => {
      if (opp.contactId) {
        const { data: lead } = await db.from("leads").select("id").eq("ghl_opportunity_id", opp.id).maybeSingle();
        if (!lead) {
          const contact = await client.getContact(opp.contactId);
          if (contact) {
            const out = await upsertFromContact(db, contact, opp.id);
            if (out.createdLead) result.leadsCreated += 1;
          }
        }
      }
      await applyOpportunity(db, opp);
      result.opportunities += 1;
    });
  }
  for (const msg of await client.recentMessages(since, RECONCILE_MAX)) {
    await guarded(async () => {
      if (!msg.contactId) return;
      await logMessage(db, msg, msg.contactId);
      result.messages += 1;
    });
  }

  const note = `${result.contacts} contacts, ${result.opportunities} opportunities, ${result.messages} messages checked; ${result.leadsCreated} leads recovered; ${result.errors} errors`;
  const { error: tErr } = await db.rpc("ghl_touch", { p_what: "reconcile", p_note: note });
  if (tErr) fail("Recording the reconciliation", tErr);
  return result;
}

// ---------------------------------------------------------------------------
// Outbound: texts that are due, and the queue of stage updates and retried sends.
// ---------------------------------------------------------------------------

export type OutboundResult = { due: number; dryRun: number; sent: number; blocked: number; waiting: number; failed: number };

export async function runOutbound(db: Db, client: GhlClient | null, now: Date): Promise<OutboundResult> {
  const result: OutboundResult = { due: 0, dryRun: 0, sent: 0, blocked: 0, waiting: 0, failed: 0 };
  const [{ data: settings, error: sErr }, { data: templates, error: tErr }, { data: due, error: dErr }] = await Promise.all([
    db.from("ghl_settings").select("business_name, max_texts_per_contact_per_day, max_texts_per_hour").eq("id", true).single(),
    db.from("message_templates").select("key, body, mode"),
    db.rpc("ghl_due_messages", { p_now: now.toISOString() }),
  ]);
  if (sErr) fail("Reading GHL settings", sErr);
  if (tErr) fail("Reading the message templates", tErr);
  if (dErr) fail("Finding due texts", dErr);
  const byKey = new Map(templates.map((t) => [t.key, t]));
  const limits = { perContactPerDay: settings.max_texts_per_contact_per_day, perHour: settings.max_texts_per_hour };

  for (const m of due) {
    const tpl = byKey.get(m.template_key);
    if (!tpl) continue;
    result.due += 1;
    const { data: counts, error: cErr } = await db.rpc("ghl_send_counts", { p_contact: m.contact_id, p_now: now.toISOString() });
    if (cErr) fail("Counting recent texts", cErr);
    const c = typeof counts === "object" && counts !== null && !Array.isArray(counts) ? counts : {};
    const decision = decideSend(now, { contactDay: Number(c.contactDay ?? 0), hour: Number(c.hour ?? 0) }, limits);
    if (decision.action === "wait") {
      result.waiting += 1;
      continue;
    }
    const dry = tpl.mode !== "live";
    const body = renderTemplate(
      tpl.body,
      templateVars({
        firstName: m.first_name ?? "",
        business: settings.business_name,
        eventAt: m.event_at ? new Date(m.event_at) : null,
        payLink: m.pay_token ? `${appUrl()}/pay/${m.pay_token}` : null,
      }),
    );
    const { data: claim, error: claimErr } = await db.rpc("ghl_claim_message", {
      p_template: m.template_key as TemplateKey, p_dedupe: m.dedupe_key, p_contact: m.contact_id,
      p_lead: m.lead_id ?? undefined, p_job: m.job_id ?? undefined, p_invoice: m.invoice_id ?? undefined,
      p_body: body, p_dry_run: dry,
    });
    if (claimErr) fail("Claiming a text", claimErr);
    const k = typeof claim === "object" && claim !== null && !Array.isArray(claim) ? claim : {};
    if (k.dry_run === true) {
      result.dryRun += 1;
    } else if (k.claimed !== true) {
      if (k.reason && k.reason !== "already handled") result.blocked += 1;
    } else if (typeof k.id === "string") {
      await sendClaimed(db, client, k.id, m.ghl_contact_id ?? "", body, result);
    }
  }
  return result;
}

/** Sends a claimed text. A failure that may pass (429, 5xx, network) is retried by the queue with backoff. */
async function sendClaimed(db: Db, client: GhlClient | null, messageId: string, ghlContactId: string, body: string, result: OutboundResult): Promise<void> {
  try {
    if (!client) throw new GhlError("GHL is not configured", null);
    const sent = await client.sendSms(ghlContactId, body);
    await db.rpc("ghl_finish_message", { p_id: messageId, p_outcome: "sent", p_ghl_message_id: sent.messageId });
    result.sent += 1;
  } catch (e) {
    const retryable = !(e instanceof GhlError) || e.retryable;
    const reason = e instanceof Error ? e.message : "send failed";
    if (retryable) {
      await db.from("sync_queue").insert({ provider: "ghl", direction: "outbound", entity_type: "message", entity_id: messageId, operation: "send_sms", last_error: reason.slice(0, 300) });
    } else {
      await db.rpc("ghl_finish_message", { p_id: messageId, p_outcome: "failed", p_error: reason });
    }
    result.failed += 1;
  }
}

export type DrainResult = { processed: number; succeeded: number; deferred: number; failed: number };

export async function drainQueue(db: Db, client: GhlClient | null, now: Date): Promise<DrainResult> {
  const result: DrainResult = { processed: 0, succeeded: 0, deferred: 0, failed: 0 };
  const { data: rows, error } = await db.rpc("ghl_claim_queue", { p_limit: 20 });
  if (error) fail("Claiming GHL work", error);
  const { data: settings, error: sErr } = await db.from("ghl_settings").select("stage_ids, opportunity_sync_mode").eq("id", true).single();
  if (sErr) fail("Reading GHL settings", sErr);

  for (const row of rows) {
    result.processed += 1;
    try {
      if (row.operation === "update_opportunity" && row.entity_id) {
        const note = await updateOpportunity(db, client, row.entity_id, parseStageIds(settings.stage_ids), settings.opportunity_sync_mode === "live");
        await db.rpc("ghl_queue_done", { p_id: row.id, p_note: note });
        result.succeeded += 1;
      } else if (row.operation === "send_sms" && row.entity_id) {
        const outcome = await retrySend(db, client, row.entity_id, now);
        if (outcome.kind === "defer") {
          await db.rpc("ghl_queue_defer", { p_id: row.id, p_until: outcome.until.toISOString() });
          result.deferred += 1;
        } else {
          await db.rpc("ghl_queue_done", { p_id: row.id, p_note: outcome.note });
          result.succeeded += 1;
        }
      } else {
        await db.rpc("ghl_queue_done", { p_id: row.id, p_note: "skipped: unknown work" });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "failed";
      const retryable = !(e instanceof GhlError) || e.retryable;
      const { data: status } = await db.rpc("ghl_queue_fail", { p_id: row.id, p_error: message });
      // A permanent error, or the last attempt, ends the work so the failed-sync list shows it.
      if (!retryable && status === "pending") await db.from("sync_queue").update({ status: "dead" }).eq("id", row.id);
      if ((status === "dead" || !retryable) && row.operation === "send_sms" && row.entity_id) {
        await db.rpc("ghl_finish_message", { p_id: row.entity_id, p_outcome: "failed", p_error: message });
      }
      result.failed += 1;
    }
  }
  return result;
}

async function updateOpportunity(db: Db, client: GhlClient | null, leadId: string, stageIds: ReturnType<typeof parseStageIds>, live: boolean): Promise<string> {
  const { data: lead, error } = await db.from("leads").select("stage, ghl_opportunity_id").eq("id", leadId).maybeSingle();
  if (error) fail("Reading the lead", error);
  if (!lead?.ghl_opportunity_id) return "skipped: lead has no GHL opportunity";
  const patch = opportunityPatch(lead.stage as LeadStage, stageIds);
  if (!patch) return `skipped: no GHL stage saved for ${lead.stage}`;
  if (!live) return `dry run: would set opportunity to ${lead.stage}`;
  if (!client) throw new GhlError("GHL is not configured", null);
  await client.updateOpportunity(lead.ghl_opportunity_id, patch);
  return `opportunity set to ${lead.stage}`;
}

async function retrySend(db: Db, client: GhlClient | null, messageId: string, now: Date): Promise<{ kind: "defer"; until: Date } | { kind: "done"; note: string }> {
  const { data: msg, error } = await db.from("message_log").select("id, outcome, body, contact_id").eq("id", messageId).maybeSingle();
  if (error) fail("Reading the text", error);
  if (!msg || msg.outcome !== "pending" || !msg.body || !msg.contact_id) return { kind: "done", note: "skipped: already handled" };
  const until = nextSendTime(now);
  if (until.getTime() > now.getTime()) return { kind: "defer", until };
  // Consent and opt-out are checked again: either may have changed since the first try.
  const { data: why } = await db.rpc("ghl_can_text", { p_contact: msg.contact_id });
  if (why) {
    await db.rpc("ghl_finish_message", { p_id: messageId, p_outcome: "failed", p_error: `not sent: ${why}` });
    return { kind: "done", note: `not sent: ${why}` };
  }
  const { data: contact } = await db.from("contacts").select("ghl_contact_id").eq("id", msg.contact_id).maybeSingle();
  if (!client || !contact?.ghl_contact_id) throw new GhlError("GHL is not configured", null);
  const sent = await client.sendSms(contact.ghl_contact_id, msg.body);
  await db.rpc("ghl_finish_message", { p_id: messageId, p_outcome: "sent", p_ghl_message_id: sent.messageId });
  return { kind: "done", note: "sent on retry" };
}
