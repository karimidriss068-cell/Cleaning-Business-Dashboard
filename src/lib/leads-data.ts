import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { LeadStage } from "@/lib/status";
import type { ServiceType } from "@/lib/leads";

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
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextFollowUpOn: string | null;
  lostReason: string | null;
  quote: { id: string; number: number; status: string } | null;
};

export type TimelineEntry = { id: string; type: string; direction: string | null; subject: string | null; body: string | null; at: string; actor: string | null };
export type TeamMember = { id: string; name: string };

const SELECT =
  "id, updated_at, created_at, stage, stage_changed_at, contact_id, service_type, source, notes, owner_id, next_follow_up_on, lost_reason, " +
  "contact:contacts(first_name, last_name, phone, email, borough, address_line1, zip), quotes(id, quote_number, status, created_at)";

/** Every lead for the board (closed ones only from the last 60 days), newest activity first. */
export async function loadLeads(supabase: SupabaseClient<Database>, since: string): Promise<{ leads: LeadRow[]; team: TeamMember[] }> {
  const [leadsRes, teamRes] = await Promise.all([
    supabase.from("leads").select(SELECT).or(`stage.in.(new,contacted,quoted),closed_at.gte.${since}`).order("stage_changed_at", { ascending: false }).limit(500),
    supabase.from("profiles").select("user_id, full_name, role").in("role", ["owner", "admin", "staff"]).order("full_name"),
  ]);
  if (leadsRes.error) throw new Error(`Leads query failed: ${leadsRes.error.message}`);
  if (teamRes.error) throw new Error(`Team query failed: ${teamRes.error.message}`);
  const team = (teamRes.data ?? []).map((p) => ({ id: p.user_id, name: p.full_name ?? "Team member" }));
  const names = new Map(team.map((t) => [t.id, t.name]));
  const rows = (leadsRes.data ?? []) as unknown as Array<{
    id: string; updated_at: string; created_at: string; stage: LeadStage; stage_changed_at: string; contact_id: string; service_type: ServiceType | null;
    source: string | null; notes: string | null; owner_id: string | null; next_follow_up_on: string | null; lost_reason: string | null;
    contact: { first_name: string; last_name: string | null; phone: string | null; email: string | null; borough: string | null; address_line1: string | null; zip: string | null } | null;
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
      serviceType: l.service_type ?? "residential",
      source: l.source,
      notes: l.notes,
      ownerId: l.owner_id,
      ownerName: l.owner_id ? (names.get(l.owner_id) ?? null) : null,
      nextFollowUpOn: l.next_follow_up_on,
      lostReason: l.lost_reason,
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
