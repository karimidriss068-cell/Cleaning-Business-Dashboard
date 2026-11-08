import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LeadStage } from "@/lib/status";
import type { ServiceType } from "@/lib/leads";
import { SHOWN_SERVICE_TYPES } from "@/config/business";

export type LeadRow = {
  id: string;
  updatedAt: string;
  createdAt: string;
  stage: LeadStage;
  stageChangedAt: string;
  contactId: string;
  name: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  borough: string | null;
  addressLine1: string | null;
  zip: string | null;
  serviceType: ServiceType;
  source: string | null;
  /** Where the lead came from for ad reporting (meta, google_search, ...) and the creative, if known. */
  channel: string;
  creative: string | null;
  /** Whether the customer agreed to automated texts, and whether their number replied STOP. */
  smsConsent: boolean;
  smsOptedOut: boolean;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextFollowUpOn: string | null;
  lostReason: string | null;
  /** Bid fields: when the bid is due, the site visit, what it is worth in cents, the owner's own chance (null = stage default) and the company. */
  bidDueOn: string | null;
  siteVisitAt: string | null;
  expectedValueCents: number | null;
  winProbabilityBps: number | null;
  accountId: string | null;
  accountName: string | null;
  quote: { id: string; number: number; status: string } | null;
};

export type TimelineEntry = { id: string; type: string; direction: string | null; subject: string | null; body: string | null; at: string; actor: string | null };
export type TeamMember = { id: string; name: string };

const SELECT =
  "id, updated_at, created_at, stage, stage_changed_at, contact_id, service_type, source, channel, creative, notes, owner_id, next_follow_up_on, lost_reason, bid_due_on, site_visit_at, expected_value_cents, win_probability_bps, account_id, account:accounts(name), " +
  "contact:contacts(first_name, last_name, phone, email, borough, address_line1, zip, sms_consent), quotes(id, quote_number, status, created_at)";

/** Every opportunity for the pipeline (closed ones only from the last 60 days), newest activity first. Only the service types the business sells now are shown. */
export async function loadLeads(supabase: SupabaseClient<Database>, since: string): Promise<{ leads: LeadRow[]; team: TeamMember[] }> {
  const [leadsRes, teamRes, optOutRes] = await Promise.all([
    supabase.from("leads").select(SELECT).in("service_type", [...SHOWN_SERVICE_TYPES]).or(`stage.in.(new,site_visit,quoted,follow_up),closed_at.gte.${since}`).order("stage_changed_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("user_id, full_name, role").in("role", ["owner", "admin", "staff"]).order("full_name"),
    supabase.from("opt_outs").select("value").eq("channel", "sms"),
  ]);
  if (leadsRes.error) throw new Error(`Leads query failed: ${leadsRes.error.message}`);
  if (teamRes.error) throw new Error(`Team query failed: ${teamRes.error.message}`);
  if (optOutRes.error) throw new Error(`Opt-outs query failed: ${optOutRes.error.message}`);
  const optedOut = new Set((optOutRes.data ?? []).map((o) => o.value));
  const team = (teamRes.data ?? []).map((p) => ({ id: p.user_id, name: p.full_name ?? "Team member" }));
  const names = new Map(team.map((t) => [t.id, t.name]));
  const rows = (leadsRes.data ?? []) as unknown as Array<{
    id: string; updated_at: string; created_at: string; stage: LeadStage; stage_changed_at: string; contact_id: string; service_type: ServiceType | null;
    source: string | null; channel: string; creative: string | null; notes: string | null; owner_id: string | null; next_follow_up_on: string | null; lost_reason: string | null;
    bid_due_on: string | null; site_visit_at: string | null; expected_value_cents: number | null; win_probability_bps: number | null; account_id: string | null; account: { name: string } | null;
    contact: { first_name: string; last_name: string | null; phone: string | null; email: string | null; borough: string | null; address_line1: string | null; zip: string | null; sms_consent: boolean } | null;
    quotes: { id: string; quote_number: number; status: string; created_at: string }[];
  }>;
  const leads = rows.map<LeadRow>((l) => {
    const q = [...(l.quotes ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return {
      id: l.id,
      updatedAt: l.updated_at,
      createdAt: l.created_at,
      stage: l.stage,
      stageChangedAt: l.stage_changed_at,
      contactId: l.contact_id,
      name: `${l.contact?.first_name ?? ""} ${l.contact?.last_name ?? ""}`.trim() || "Unnamed",
      firstName: l.contact?.first_name ?? "",
      lastName: l.contact?.last_name ?? null,
      phone: l.contact?.phone ?? null,
      email: l.contact?.email ?? null,
      borough: l.contact?.borough ?? null,
      addressLine1: l.contact?.address_line1 ?? null,
      zip: l.contact?.zip ?? null,
      serviceType: l.service_type ?? "commercial",
      source: l.source,
      channel: l.channel,
      creative: l.creative,
      smsConsent: l.contact?.sms_consent ?? false,
      smsOptedOut: l.contact?.phone ? optedOut.has(l.contact.phone) : false,
      notes: l.notes,
      ownerId: l.owner_id,
      ownerName: l.owner_id ? (names.get(l.owner_id) ?? null) : null,
      nextFollowUpOn: l.next_follow_up_on,
      lostReason: l.lost_reason,
      bidDueOn: l.bid_due_on,
      siteVisitAt: l.site_visit_at,
      expectedValueCents: l.expected_value_cents === null ? null : Number(l.expected_value_cents),
      winProbabilityBps: l.win_probability_bps,
      accountId: l.account_id,
      accountName: l.account?.name ?? null,
      quote: q ? { id: q.id, number: Number(q.quote_number), status: q.status } : null,
    };
  });
  return { leads, team };
}

export async function loadTimeline(supabase: SupabaseClient<Database>, leadId: string): Promise<TimelineEntry[]> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, type, direction, subject, body, occurred_at, actor:profiles!activities_actor_user_id_fkey(full_name)")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Timeline query failed: ${error.message}`);
  return (data ?? []).map((a) => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    subject: a.subject,
    body: a.body,
    at: a.occurred_at,
    actor: (a.actor as { full_name: string | null } | null)?.full_name ?? null,
  }));
}
