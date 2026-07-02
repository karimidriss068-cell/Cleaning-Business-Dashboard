import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { currentWeekRange } from "@/lib/format";
import { computeFunnel } from "@/lib/outreach";

/**
 * Builds a compact, aggregated snapshot of the whole MAKI Ops business for the
 * AI insights feature. Numbers only (no raw PII-heavy rows) so the payload stays
 * small and Claude can reason over the full picture.
 */
export async function getInsightsData(
  supabase: SupabaseClient<Database>,
) {
  const { weekStart } = currentWeekRange();
  const now = Date.now();
  const DAY = 86400000;
  const lastWeekStart = new Date(new Date(weekStart).getTime() - 7 * DAY)
    .toISOString()
    .slice(0, 10);
  const since30 = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const since7 = new Date(now - 7 * DAY).toISOString().slice(0, 10);

  const [
    { data: accounts },
    { data: campaigns },
    { data: spend },
    { data: leads },
    { data: appts },
    { data: scripts },
    { data: contacts },
    { data: alerts },
  ] = await Promise.all([
    supabase.from("accounts").select("id, name, type, price_per_appointment, cpa_alert_threshold, auto_pause_threshold, status"),
    supabase.from("campaigns").select("id, name, account_id, status"),
    supabase.from("spend_daily").select("campaign_id, date, spend").gte("date", since30),
    supabase.from("leads").select("campaign_id, created_at").gte("created_at", since30),
    supabase.from("appointments").select("account_id, lead_id, booked_at, status, revenue_owed").gte("booked_at", since30),
    supabase.from("outreach_scripts").select("id, name, channel, status"),
    supabase.from("outreach_contacts").select("script_id, status, created_at"),
    supabase.from("alerts").select("type, message, acknowledged, campaign_id, triggered_at").eq("acknowledged", false),
  ]);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

  // Per-campaign aggregates (7d + 30d spend, 30d leads).
  const cAgg = new Map<string, { spend7: number; spend30: number; leads30: number; appts30: number }>();
  const ensureC = (id: string) => {
    if (!cAgg.has(id)) cAgg.set(id, { spend7: 0, spend30: 0, leads30: 0, appts30: 0 });
    return cAgg.get(id)!;
  };
  for (const s of spend ?? []) {
    const a = ensureC(s.campaign_id);
    a.spend30 += Number(s.spend ?? 0);
    if (s.date >= since7) a.spend7 += Number(s.spend ?? 0);
  }
  for (const l of leads ?? []) {
    if (l.campaign_id) ensureC(l.campaign_id).leads30 += 1;
  }

  // Appointments -> campaign via lead (we only have account_id on appt, so map by lead).
  // Fetch lead->campaign for the appt leads we saw. leads query above lacks id; approximate
  // per-account instead for appts (accurate at account level).
  const acctAppts = new Map<string, { appts: number; showed: number; revenue: number }>();
  for (const ap of appts ?? []) {
    const cur = acctAppts.get(ap.account_id) ?? { appts: 0, showed: 0, revenue: 0 };
    cur.appts += 1;
    if (["showed", "closed"].includes(ap.status)) cur.showed += 1;
    cur.revenue += Number(ap.revenue_owed ?? 0);
    acctAppts.set(ap.account_id, cur);
  }

  // Per-account 30d rollup.
  const accountSummaries = (accounts ?? []).map((a) => {
    const cids = (campaigns ?? []).filter((c) => c.account_id === a.id).map((c) => c.id);
    const spend30 = cids.reduce((s, id) => s + (cAgg.get(id)?.spend30 ?? 0), 0);
    const leads30 = cids.reduce((s, id) => s + (cAgg.get(id)?.leads30 ?? 0), 0);
    const ap = acctAppts.get(a.id) ?? { appts: 0, showed: 0, revenue: 0 };
    return {
      name: a.name,
      type: a.type,
      status: a.status,
      price_per_appointment: a.price_per_appointment,
      cpa_alert_threshold: a.cpa_alert_threshold,
      auto_pause_threshold: a.auto_pause_threshold,
      last30d: {
        spend: round(spend30),
        leads: leads30,
        appointments: ap.appts,
        showed: ap.showed,
        revenue: round(ap.revenue),
        margin: round(ap.revenue - spend30),
        cpa: ap.appts > 0 ? round(spend30 / ap.appts) : null,
      },
    };
  });

  // Per-campaign 7d snapshot.
  const campaignSummaries = (campaigns ?? []).map((c) => {
    const agg = cAgg.get(c.id) ?? { spend7: 0, leads30: 0, appts30: 0, spend30: 0 };
    return {
      name: c.name,
      account: accountById.get(c.account_id)?.name ?? null,
      status: c.status,
      last7d_spend: round(agg.spend7),
      last30d_leads: agg.leads30,
    };
  });

  // Weekly internal vs client (this week vs last week) — spend, leads, appts.
  const campaignType = new Map(
    (campaigns ?? []).map((c) => [c.id, accountById.get(c.account_id)?.type]),
  );
  const weekAgg = {
    internal: { thisWeek: blank(), lastWeek: blank() },
    client: { thisWeek: blank(), lastWeek: blank() },
  };
  for (const s of spend ?? []) {
    const t = campaignType.get(s.campaign_id);
    if (!t) continue;
    if (s.date >= weekStart) weekAgg[t].thisWeek.spend += Number(s.spend ?? 0);
    else if (s.date >= lastWeekStart) weekAgg[t].lastWeek.spend += Number(s.spend ?? 0);
  }
  for (const l of leads ?? []) {
    if (!l.campaign_id) continue;
    const t = campaignType.get(l.campaign_id);
    if (!t) continue;
    const d = l.created_at.slice(0, 10);
    if (d >= weekStart) weekAgg[t].thisWeek.leads += 1;
    else if (d >= lastWeekStart) weekAgg[t].lastWeek.leads += 1;
  }
  for (const ap of appts ?? []) {
    const t = accountById.get(ap.account_id)?.type;
    if (!t) continue;
    const d = ap.booked_at.slice(0, 10);
    if (d >= weekStart) weekAgg[t].thisWeek.appts += 1;
    else if (d >= lastWeekStart) weekAgg[t].lastWeek.appts += 1;
  }

  // Outreach scripts funnel.
  const contactsByScript = new Map<
    string,
    { status: Database["public"]["Enums"]["outreach_contact_status"] }[]
  >();
  for (const ct of contacts ?? []) {
    if (!ct.script_id) continue;
    const arr = contactsByScript.get(ct.script_id) ?? [];
    arr.push({ status: ct.status });
    contactsByScript.set(ct.script_id, arr);
  }
  const scriptSummaries = (scripts ?? []).map((sc) => {
    const f = computeFunnel(contactsByScript.get(sc.id) ?? []);
    return {
      name: sc.name,
      channel: sc.channel,
      status: sc.status,
      contacted: f.contacted,
      reply_rate: pctRound(f.replyRate),
      call_booked_rate: pctRound(f.callBookedRate),
      close_rate: pctRound(f.closeRate),
    };
  });

  return {
    context: "MAKI Ops — marketing agency internal dashboard. 'internal' accounts are MAKI's own client-acquisition ads; 'client' accounts are ads MAKI runs for clients at $327 per booked appointment. Money is USD.",
    periods: { this_week_start: weekStart, last_week_start: lastWeekStart, rollup_window_days: 30 },
    accounts: accountSummaries,
    campaigns: campaignSummaries,
    weekly_by_context: weekAgg,
    outreach_scripts: scriptSummaries,
    unacknowledged_alerts: (alerts ?? []).map((a) => ({
      type: a.type,
      message: a.message,
      campaign: campaignById.get(a.campaign_id)?.name ?? null,
    })),
  };
}

function blank() {
  return { spend: 0, leads: 0, appts: 0 };
}
function round(n: number) {
  return Math.round(n * 100) / 100;
}
function pctRound(r: number) {
  return Math.round(r * 100);
}
