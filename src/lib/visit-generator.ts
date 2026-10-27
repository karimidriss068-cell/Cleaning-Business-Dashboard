import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { nyToday } from "@/lib/format";
import { planVisits } from "@/lib/recurrence";

export type GenerationSummary = {
  today: string;
  series: number;
  skipped: number;
  visitsCreated: number;
  assignmentsCreated: number;
  errors: string[];
};

/**
 * Creates visits 8 weeks ahead for every active recurring series. Idempotent:
 * inserts ignore existing (series_id, scheduled_start) rows, so reruns create
 * nothing twice. Skips paused/ended series and series whose commercial account
 * is paused or churned. New visits keep the cleaners from the series' most
 * recent assigned visit (continuity for the client); pay terms are snapshotted
 * by the database. Runs with the service role (cron), so it filters explicitly.
 */
export async function generateVisits(supabase: SupabaseClient<Database>, now = new Date()): Promise<GenerationSummary> {
  const today = nyToday(now);
  const summary: GenerationSummary = { today, series: 0, skipped: 0, visitsCreated: 0, assignmentsCreated: 0, errors: [] };

  const { data: series, error } = await supabase
    .from("job_series")
    .select("id, recurrence_rule, start_date, end_date, generated_through, local_start_time, duration_minutes, price_cents, contact_id, account_id, property_id, service_id, default_crew_id, account:accounts(status)")
    .eq("is_active", true)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) throw new Error(`Loading series failed: ${error.message}`);

  for (const s of series ?? []) {
    if (s.account && (s.account.status === "paused" || s.account.status === "churned")) {
      summary.skipped++;
      continue;
    }
    summary.series++;
    let plan;
    try {
      plan = planVisits(s, today);
    } catch (e) {
      summary.errors.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (plan.visits.length > 0) {
      const { data: created, error: insertError } = await supabase
        .from("jobs")
        .upsert(
          plan.visits.map((v) => ({
            series_id: s.id,
            contact_id: s.contact_id,
            account_id: s.account_id,
            property_id: s.property_id,
            service_id: s.service_id,
            crew_id: s.default_crew_id,
            scheduled_start: v.start.toISOString(),
            scheduled_end: v.end.toISOString(),
            price_cents: s.price_cents,
            status: "scheduled" as const,
          })),
          { onConflict: "series_id,scheduled_start", ignoreDuplicates: true },
        )
        .select("id");
      if (insertError) {
        summary.errors.push(`${s.id}: ${insertError.message}`);
        continue;
      }
      summary.visitsCreated += created?.length ?? 0;

      if (created && created.length > 0) {
        const { data: previous } = await supabase
          .from("jobs")
          .select("id, job_assignments!inner(subcontractor_id)")
          .eq("series_id", s.id)
          .lt("scheduled_start", plan.visits[0].start.toISOString())
          .order("scheduled_start", { ascending: false })
          .limit(1);
        const crewIds = previous?.[0]?.job_assignments.map((a) => a.subcontractor_id) ?? [];
        // Current pay terms (the same snapshot the database trigger would take).
        const { data: crew } = crewIds.length
          ? await supabase.from("subcontractors").select("id, pay_type, pay_rate_bps, pay_rate_cents").in("id", crewIds).eq("status", "active")
          : { data: [] };
        if (crew && crew.length > 0) {
          const { data: assigned, error: assignError } = await supabase
            .from("job_assignments")
            .insert(
              created.flatMap((j) =>
                crew.map((c) => ({ job_id: j.id, subcontractor_id: c.id, pay_type: c.pay_type, pay_rate_bps: c.pay_rate_bps, pay_rate_cents: c.pay_rate_cents })),
              ),
            )
            .select("id");
          if (assignError) summary.errors.push(`${s.id} assignments: ${assignError.message}`);
          summary.assignmentsCreated += assigned?.length ?? 0;
        }
      }
    }

    if (!s.generated_through || plan.generatedThrough > s.generated_through) {
      const { error: updateError } = await supabase.from("job_series").update({ generated_through: plan.generatedThrough }).eq("id", s.id);
      if (updateError) summary.errors.push(`${s.id} generated_through: ${updateError.message}`);
    }
  }
  return summary;
}
