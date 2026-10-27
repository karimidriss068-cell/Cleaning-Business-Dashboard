import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { addDays, nyDayRangeUtc } from "@/lib/format";
import type { CrewMember } from "@/lib/dispatch";
import type { BoardVisit } from "@/lib/schedule-lanes";

export type ScheduleData = {
  visits: BoardVisit[];
  crews: { id: string; name: string }[];
  /** Every cleaner (any status), for conflict checks. Lanes use the active ones. */
  roster: CrewMember[];
  crewMembers: { crewId: string; subcontractorId: string }[];
};

const JOB_SELECT =
  "id, updated_at, scheduled_start, scheduled_end, status, price_cents, crew_id, contact:contacts(first_name, last_name), account:accounts(name), property:properties(borough), service:services(name), crew:crews(name), job_assignments(subcontractor:subcontractors(id, display_name))";

type JobRow = {
  id: string;
  updated_at: string;
  scheduled_start: string;
  scheduled_end: string;
  status: BoardVisit["status"];
  price_cents: number;
  crew_id: string | null;
  contact: { first_name: string; last_name: string | null } | null;
  account: { name: string } | null;
  property: { borough: string | null } | null;
  service: { name: string } | null;
  crew: { name: string } | null;
  job_assignments: { subcontractor: { id: string; display_name: string } | null }[];
};

function toVisit(j: JobRow): BoardVisit {
  return {
    id: j.id,
    updatedAt: j.updated_at,
    start: j.scheduled_start,
    end: j.scheduled_end,
    status: j.status,
    clientName: j.account?.name ?? ([j.contact?.first_name, j.contact?.last_name].filter(Boolean).join(" ") || "Client"),
    serviceName: j.service?.name ?? "Visit",
    borough: j.property?.borough ?? null,
    priceCents: j.price_cents,
    crewId: j.crew_id,
    crewName: j.crew?.name ?? null,
    people: j.job_assignments.flatMap((a) => (a.subcontractor ? [{ id: a.subcontractor.id, name: a.subcontractor.display_name }] : [])),
  };
}

/** Visits from the first NY day through the last (inclusive), plus lane data. RLS applies: staff only. */
export async function loadRange(supabase: SupabaseClient<Database>, fromDate: string, toDate: string): Promise<ScheduleData> {
  const [jobsRes, crewsRes, subsRes, membersRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(JOB_SELECT)
      .gte("scheduled_start", nyDayRangeUtc(fromDate).start.toISOString())
      .lt("scheduled_start", nyDayRangeUtc(toDate).end.toISOString())
      .order("scheduled_start"),
    supabase.from("crews").select("id, name").eq("is_active", true).order("name"),
    supabase.from("subcontractors").select("id, display_name, status, coi_expires_on, boroughs_served").order("display_name"),
    supabase.from("crew_members").select("crew_id, subcontractor_id"),
  ]);
  const failed = [jobsRes, crewsRes, subsRes, membersRes].find((r) => r.error);
  if (failed?.error) throw new Error(`Loading the schedule failed: ${failed.error.message}`);

  return {
    visits: ((jobsRes.data ?? []) as unknown as JobRow[]).map(toVisit),
    crews: crewsRes.data ?? [],
    roster: (subsRes.data ?? []).map((s) => ({ id: s.id, name: s.display_name, status: s.status, coiExpiresOn: s.coi_expires_on, boroughs: s.boroughs_served })),
    crewMembers: (membersRes.data ?? []).map((m) => ({ crewId: m.crew_id, subcontractorId: m.subcontractor_id })),
  };
}

/** Scheduled visits in the next 7 NY days (from today) with nobody assigned: the dispatch tray. */
export async function loadUnassigned(supabase: SupabaseClient<Database>, today: string): Promise<BoardVisit[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("status", "scheduled")
    .gte("scheduled_start", nyDayRangeUtc(today).start.toISOString())
    .lt("scheduled_start", nyDayRangeUtc(addDays(today, 6)).end.toISOString())
    .order("scheduled_start");
  if (error) throw new Error(`Loading unassigned visits failed: ${error.message}`);
  return ((data ?? []) as unknown as JobRow[]).map(toVisit).filter((v) => v.people.length === 0);
}
