import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { nyDayRangeUtc } from "@/lib/format";
import type { BoardVisit } from "@/lib/schedule-lanes";

export type DayData = {
  visits: BoardVisit[];
  crews: { id: string; name: string }[];
  people: { id: string; name: string }[];
};

/** Everything the day board shows for one NY calendar day (RLS applies: staff only). */
export async function loadDay(supabase: SupabaseClient<Database>, date: string): Promise<DayData> {
  const range = nyDayRangeUtc(date);
  const [jobsRes, crewsRes, peopleRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, scheduled_start, scheduled_end, status, price_cents, crew_id, contact:contacts(first_name, last_name), account:accounts(name), property:properties(borough), service:services(name), crew:crews(name), job_assignments(subcontractor:subcontractors(id, display_name))",
      )
      .gte("scheduled_start", range.start.toISOString())
      .lt("scheduled_start", range.end.toISOString())
      .order("scheduled_start"),
    supabase.from("crews").select("id, name").eq("is_active", true).order("name"),
    supabase.from("subcontractors").select("id, display_name").eq("status", "active").order("display_name"),
  ]);
  const failed = [jobsRes, crewsRes, peopleRes].find((r) => r.error);
  if (failed?.error) throw new Error(`Loading the schedule failed: ${failed.error.message}`);

  const visits: BoardVisit[] = (jobsRes.data ?? []).map((j) => ({
    id: j.id,
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
  }));

  return {
    visits,
    crews: crewsRes.data ?? [],
    people: (peopleRes.data ?? []).map((p) => ({ id: p.id, name: p.display_name })),
  };
}
