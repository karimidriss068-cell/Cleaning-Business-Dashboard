import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const DAY = 86400000;

export type ProviderPerformance = {
  providerId: string;
  providerName: string;
  role: string | null;
  accountId: string;
  accountName: string;
  appointmentsBooked30d: number;
  appointmentsShowed30d: number;
  jobsClosed30d: number;
  revenue30d: number;
  /**
   * Booked-appointment counts and revenue only, for now — there's no
   * schedule/capacity data yet to compute a real utilization rate against.
   * Flagged here as a future enhancement, not silently approximated.
   */
  utilizationRateAvailable: false;
};

/**
 * Per-provider booked appointments and confirmed treatment revenue over the
 * last 30 days, rolled up from appointments.provider_id and job_revenue
 * (the same job-closed follow-up loop used elsewhere). Providers with zero
 * appointments in the window are still included at zero, so a provider
 * roster with no bookings yet is visible, not silently dropped.
 */
export async function getProviderPerformance(
  supabase: SupabaseClient<Database>,
): Promise<ProviderPerformance[]> {
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();

  const [{ data: providers }, { data: appts }] = await Promise.all([
    supabase.from("providers").select("id, name, role, account_id, account:accounts(name)"),
    supabase
      .from("appointments")
      .select("provider_id, status, booked_at, job_closed, job_revenue")
      .gte("booked_at", since30)
      .not("provider_id", "is", null),
  ]);

  type Agg = { booked: number; showed: number; jobsClosed: number; revenue: number };
  const agg = new Map<string, Agg>();
  const ensure = (id: string): Agg => {
    if (!agg.has(id)) agg.set(id, { booked: 0, showed: 0, jobsClosed: 0, revenue: 0 });
    return agg.get(id)!;
  };
  for (const a of appts ?? []) {
    if (!a.provider_id) continue;
    const g = ensure(a.provider_id);
    g.booked += 1;
    if (a.status === "showed" || a.status === "closed") g.showed += 1;
    if (a.job_closed === true) {
      g.jobsClosed += 1;
      g.revenue += Number(a.job_revenue ?? 0);
    }
  }

  return (providers ?? []).map((p) => {
    const g = agg.get(p.id) ?? { booked: 0, showed: 0, jobsClosed: 0, revenue: 0 };
    return {
      providerId: p.id,
      providerName: p.name,
      role: p.role,
      accountId: p.account_id,
      accountName: p.account?.name ?? "That account",
      appointmentsBooked30d: g.booked,
      appointmentsShowed30d: g.showed,
      jobsClosed30d: g.jobsClosed,
      revenue30d: Math.round(g.revenue * 100) / 100,
      utilizationRateAvailable: false,
    };
  });
}
