import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ReportData = {
  account: {
    name: string;
    niche: string | null;
    price_per_appointment: number | null;
  };
  from: string;
  to: string;
  spend: number;
  leads: number;
  contacted: number;
  qualified: number;
  booked: number;
  showed: number;
  revenue: number;
  cpa: number | null;
};

/**
 * Compute a client's performance over a date range. Works with either the
 * server (RLS) client or the service-role client (public report route).
 */
export async function getReportData(
  supabase: SupabaseClient<Database>,
  accountId: string,
  from: string,
  to: string,
): Promise<ReportData | null> {
  const { data: account } = await supabase
    .from("accounts")
    .select("name, niche, price_per_appointment")
    .eq("id", accountId)
    .single();
  if (!account) return null;

  const toEnd = `${to}T23:59:59.999`;

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("account_id", accountId);
  const cids = (campaigns ?? []).map((c) => c.id);

  let spend = 0;
  let leadRows: { status: string }[] = [];
  if (cids.length > 0) {
    const [{ data: spendRows }, { data: leads }] = await Promise.all([
      supabase
        .from("spend_daily")
        .select("spend")
        .in("campaign_id", cids)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("leads")
        .select("status")
        .in("campaign_id", cids)
        .gte("created_at", from)
        .lte("created_at", toEnd),
    ]);
    spend = (spendRows ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
    leadRows = leads ?? [];
  }

  const { data: appts } = await supabase
    .from("appointments")
    .select("status, revenue_owed")
    .eq("account_id", accountId)
    .gte("booked_at", from)
    .lte("booked_at", toEnd);
  const apptRows = appts ?? [];

  const leadsTotal = leadRows.length;
  const contacted = leadRows.filter((l) =>
    ["contacted", "qualified", "booked"].includes(l.status),
  ).length;
  const qualified = leadRows.filter((l) =>
    ["qualified", "booked"].includes(l.status),
  ).length;
  const booked = apptRows.length;
  const showed = apptRows.filter((a) =>
    ["showed", "closed"].includes(a.status),
  ).length;
  const revenue = apptRows.reduce((s, a) => s + Number(a.revenue_owed ?? 0), 0);

  return {
    account,
    from,
    to,
    spend,
    leads: leadsTotal,
    contacted,
    qualified,
    booked,
    showed,
    revenue,
    cpa: booked > 0 ? spend / booked : null,
  };
}
