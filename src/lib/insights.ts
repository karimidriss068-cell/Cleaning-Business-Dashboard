import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { currentWeekRange } from "@/lib/format";
import { computeFunnel } from "@/lib/outreach";

const DAY = 86400000;
const NO_ACTIVITY_THRESHOLD_DAYS = 14;

type AppointmentRow = {
  status: Database["public"]["Enums"]["appointment_status"];
  job_closed: boolean | null;
};

/**
 * Whether an appointment turned into a real paid job — job_closed (from the
 * SMS follow-up loop, see src/lib/job-followup.ts) is the source of truth
 * when it's been answered. The legacy 'closed' status value is treated as a
 * closed signal too (some appointments were marked that way before the
 * follow-up loop existed), but never implies a revenue figure — only actual
 * job_revenue replies ever contribute to closed-revenue totals.
 */
function resolvedJobStatus(ap: AppointmentRow): "closed" | "not_closed" | "pending" {
  if (ap.job_closed === true) return "closed";
  if (ap.job_closed === false) return "not_closed";
  if (ap.status === "closed") return "closed";
  if (ap.status === "no_show" || ap.status === "cancelled") return "not_closed";
  return "pending";
}

/**
 * Builds a full aggregated snapshot of the MAKI Ops business for the AI
 * insights feature — every account, campaign, creative, and outreach script,
 * with derived signals (at-risk accounts, week-over-week trends) computed
 * here in code, not left for the model to infer from raw rows. IDs are
 * included throughout so the UI can turn entity mentions into links.
 */
export async function getInsightsData(supabase: SupabaseClient<Database>) {
  const { weekStart } = currentWeekRange();
  const now = Date.now();
  const nowDate = new Date(now);
  const lastWeekStart = new Date(new Date(weekStart).getTime() - 7 * DAY)
    .toISOString()
    .slice(0, 10);
  const since30 = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const since7 = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const todayIso = new Date(now).toISOString().slice(0, 10);

  // Calendar-month boundaries (UTC), for "this month vs last month" trend
  // context — distinct from the rolling 30-day window used elsewhere.
  const thisMonthStart = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthDate = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 1, 1));
  const lastMonthStart = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
  // Fetch back far enough to cover last calendar month too, whichever bound
  // is further back (near the start of a month, last month's start can be
  // further back than the rolling 30-day window).
  const sinceFetch = lastMonthStart < since30 ? lastMonthStart : since30;

  const [
    { data: accounts },
    { data: campaigns },
    { data: creatives },
    { data: campaignCreatives },
    { data: spend },
    { data: leads },
    { data: appts },
    { data: scripts },
    { data: contacts },
    { data: alerts },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, name, niche, type, price_per_appointment, cpa_alert_threshold, auto_pause_threshold, status",
      ),
    supabase.from("campaigns").select("id, name, account_id, status"),
    supabase.from("creatives").select("id, name, type, status, account_id"),
    supabase.from("campaign_creatives").select("campaign_id, creative_id"),
    supabase
      .from("spend_daily")
      .select("campaign_id, date, spend")
      .gte("date", sinceFetch),
    supabase
      .from("leads")
      .select("id, campaign_id, created_at")
      .gte("created_at", sinceFetch),
    supabase
      .from("appointments")
      .select("account_id, lead_id, booked_at, status, revenue_owed, job_closed, job_revenue")
      .gte("booked_at", sinceFetch),
    supabase.from("outreach_scripts").select("id, name, channel, status"),
    supabase
      .from("outreach_contacts")
      .select("script_id, status, created_at"),
    supabase
      .from("alerts")
      .select("type, message, acknowledged, campaign_id, triggered_at")
      .eq("acknowledged", false),
  ]);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const leadCampaign = new Map((leads ?? []).map((l) => [l.id, l.campaign_id]));

  // ---- Per-campaign aggregates: spend (7d/30d/this-week/last-week), leads, appts ----
  type CampaignAgg = {
    spend7: number;
    spend30: number;
    spendThisWeek: number;
    spendLastWeek: number;
    spendThisMonth: number;
    spendLastMonth: number;
    leads30: number;
    leadsThisWeek: number;
    leadsLastWeek: number;
    leadsThisMonth: number;
    leadsLastMonth: number;
    lastLeadDate: string | null;
    appts30: number;
    apptsThisWeek: number;
    apptsLastWeek: number;
    apptsThisMonth: number;
    apptsLastMonth: number;
    revenue30: number;
    lastApptDate: string | null;
    // Job-closed revenue loop (Phase 1) — 30d window only for now, the
    // signal is too sparse yet to slice by week/month too.
    showed30: number;
    jobsClosed30: number;
    jobsNotClosed30: number;
    jobsPending30: number;
    closedRevenue30: number;
  };
  const cAgg = new Map<string, CampaignAgg>();
  const ensureC = (id: string): CampaignAgg => {
    if (!cAgg.has(id)) {
      cAgg.set(id, {
        spend7: 0,
        spend30: 0,
        spendThisWeek: 0,
        spendLastWeek: 0,
        spendThisMonth: 0,
        spendLastMonth: 0,
        leads30: 0,
        leadsThisWeek: 0,
        leadsLastWeek: 0,
        leadsThisMonth: 0,
        leadsLastMonth: 0,
        lastLeadDate: null,
        appts30: 0,
        apptsThisWeek: 0,
        apptsLastWeek: 0,
        apptsThisMonth: 0,
        apptsLastMonth: 0,
        revenue30: 0,
        lastApptDate: null,
        showed30: 0,
        jobsClosed30: 0,
        jobsNotClosed30: 0,
        jobsPending30: 0,
        closedRevenue30: 0,
      });
    }
    return cAgg.get(id)!;
  };

  for (const s of spend ?? []) {
    const a = ensureC(s.campaign_id);
    if (s.date >= since30) a.spend30 += Number(s.spend ?? 0);
    if (s.date >= since7) a.spend7 += Number(s.spend ?? 0);
    if (s.date >= weekStart) a.spendThisWeek += Number(s.spend ?? 0);
    else if (s.date >= lastWeekStart) a.spendLastWeek += Number(s.spend ?? 0);
    if (s.date >= thisMonthStart) a.spendThisMonth += Number(s.spend ?? 0);
    else if (s.date >= lastMonthStart) a.spendLastMonth += Number(s.spend ?? 0);
  }
  for (const l of leads ?? []) {
    if (!l.campaign_id) continue;
    const a = ensureC(l.campaign_id);
    const d = l.created_at.slice(0, 10);
    if (d >= since30) a.leads30 += 1;
    if (d >= weekStart) a.leadsThisWeek += 1;
    else if (d >= lastWeekStart) a.leadsLastWeek += 1;
    if (d >= thisMonthStart) a.leadsThisMonth += 1;
    else if (d >= lastMonthStart) a.leadsLastMonth += 1;
    if (!a.lastLeadDate || d > a.lastLeadDate) a.lastLeadDate = d;
  }
  for (const ap of appts ?? []) {
    const cid = leadCampaign.get(ap.lead_id);
    if (!cid) continue;
    const a = ensureC(cid);
    const d = ap.booked_at.slice(0, 10);
    if (d >= since30) {
      a.appts30 += 1;
      a.revenue30 += Number(ap.revenue_owed ?? 0);
      if (ap.status === "showed" || ap.status === "closed") {
        a.showed30 += 1;
        const resolved = resolvedJobStatus(ap);
        if (resolved === "closed") {
          a.jobsClosed30 += 1;
          a.closedRevenue30 += Number(ap.job_revenue ?? 0);
        } else if (resolved === "not_closed") {
          a.jobsNotClosed30 += 1;
        } else {
          a.jobsPending30 += 1;
        }
      }
    }
    if (d >= weekStart) a.apptsThisWeek += 1;
    else if (d >= lastWeekStart) a.apptsLastWeek += 1;
    if (d >= thisMonthStart) a.apptsThisMonth += 1;
    else if (d >= lastMonthStart) a.apptsLastMonth += 1;
    if (!a.lastApptDate || d > a.lastApptDate) a.lastApptDate = d;
  }

  // ---- Per-account rollups (sum of that account's campaigns) + risk signal ----
  const acctAppts = new Map<
    string,
    { appts: number; showed: number; revenue: number }
  >();
  for (const ap of appts ?? []) {
    // appts is now fetched back to sinceFetch (may exceed 30 days, to also
    // cover last calendar month for month_over_month) — gate this rollup to
    // the last30d window explicitly rather than assuming the fetch already did.
    if (ap.booked_at.slice(0, 10) < since30) continue;
    const cur = acctAppts.get(ap.account_id) ?? { appts: 0, showed: 0, revenue: 0 };
    cur.appts += 1;
    if (["showed", "closed"].includes(ap.status)) cur.showed += 1;
    cur.revenue += Number(ap.revenue_owed ?? 0);
    acctAppts.set(ap.account_id, cur);
  }

  const alertsByCampaign = new Map<string, { type: string; message: string }[]>();
  for (const al of alerts ?? []) {
    const arr = alertsByCampaign.get(al.campaign_id) ?? [];
    arr.push({ type: al.type, message: al.message });
    alertsByCampaign.set(al.campaign_id, arr);
  }

  const accountSummaries = (accounts ?? []).map((a) => {
    const campaignsForAcct = (campaigns ?? []).filter((c) => c.account_id === a.id);
    const cids = campaignsForAcct.map((c) => c.id);

    const spend30 = cids.reduce((s, id) => s + (cAgg.get(id)?.spend30 ?? 0), 0);
    const leads30 = cids.reduce((s, id) => s + (cAgg.get(id)?.leads30 ?? 0), 0);
    const spendThisWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.spendThisWeek ?? 0), 0);
    const spendLastWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.spendLastWeek ?? 0), 0);
    const leadsThisWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.leadsThisWeek ?? 0), 0);
    const leadsLastWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.leadsLastWeek ?? 0), 0);
    const apptsThisWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.apptsThisWeek ?? 0), 0);
    const apptsLastWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.apptsLastWeek ?? 0), 0);
    const spendThisMonth = cids.reduce((s, id) => s + (cAgg.get(id)?.spendThisMonth ?? 0), 0);
    const spendLastMonth = cids.reduce((s, id) => s + (cAgg.get(id)?.spendLastMonth ?? 0), 0);
    const leadsThisMonth = cids.reduce((s, id) => s + (cAgg.get(id)?.leadsThisMonth ?? 0), 0);
    const leadsLastMonth = cids.reduce((s, id) => s + (cAgg.get(id)?.leadsLastMonth ?? 0), 0);
    const apptsThisMonth = cids.reduce((s, id) => s + (cAgg.get(id)?.apptsThisMonth ?? 0), 0);
    const apptsLastMonth = cids.reduce((s, id) => s + (cAgg.get(id)?.apptsLastMonth ?? 0), 0);
    const showed30 = cids.reduce((s, id) => s + (cAgg.get(id)?.showed30 ?? 0), 0);
    const jobsClosed30 = cids.reduce((s, id) => s + (cAgg.get(id)?.jobsClosed30 ?? 0), 0);
    const jobsNotClosed30 = cids.reduce((s, id) => s + (cAgg.get(id)?.jobsNotClosed30 ?? 0), 0);
    const jobsPending30 = cids.reduce((s, id) => s + (cAgg.get(id)?.jobsPending30 ?? 0), 0);
    const closedRevenue30 = cids.reduce((s, id) => s + (cAgg.get(id)?.closedRevenue30 ?? 0), 0);
    const jobsAnswered30 = jobsClosed30 + jobsNotClosed30;

    const lastLeadDate =
      cids
        .map((id) => cAgg.get(id)?.lastLeadDate)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;
    const lastApptDate =
      cids
        .map((id) => cAgg.get(id)?.lastApptDate)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;

    const ap = acctAppts.get(a.id) ?? { appts: 0, showed: 0, revenue: 0 };
    const cpaThisWeek = apptsThisWeek > 0 ? spendThisWeek / apptsThisWeek : null;
    const cpaLastWeek = apptsLastWeek > 0 ? spendLastWeek / apptsLastWeek : null;
    const cpaThisMonth = apptsThisMonth > 0 ? spendThisMonth / apptsThisMonth : null;
    const cpaLastMonth = apptsLastMonth > 0 ? spendLastMonth / apptsLastMonth : null;

    const daysSinceLastLead = lastLeadDate
      ? Math.floor((now - new Date(`${lastLeadDate}T00:00:00Z`).getTime()) / DAY)
      : null;
    const daysSinceLastAppt = lastApptDate
      ? Math.floor((now - new Date(`${lastApptDate}T00:00:00Z`).getTime()) / DAY)
      : null;

    // Deterministic at-risk signal — computed here, not left to the model.
    const reasons: string[] = [];
    const hasAnyActivity30d = leads30 > 0 || ap.appts > 0;
    if (!hasAnyActivity30d) {
      reasons.push("no_leads_or_appointments_in_last_30_days");
    } else if (
      (daysSinceLastLead === null || daysSinceLastLead > NO_ACTIVITY_THRESHOLD_DAYS) &&
      (daysSinceLastAppt === null || daysSinceLastAppt > NO_ACTIVITY_THRESHOLD_DAYS)
    ) {
      reasons.push(`no_activity_in_last_${NO_ACTIVITY_THRESHOLD_DAYS}_days`);
    }
    if (leadsLastWeek > 0 && leadsThisWeek < leadsLastWeek * 0.5) {
      reasons.push("leads_declining_week_over_week");
    }
    if (apptsLastWeek > 0 && apptsThisWeek < apptsLastWeek * 0.5) {
      reasons.push("appointments_declining_week_over_week");
    }
    if (cpaThisWeek !== null && cpaLastWeek !== null && cpaThisWeek > cpaLastWeek * 1.3) {
      reasons.push("cpa_rising_week_over_week");
    }
    if (
      cpaThisWeek !== null &&
      a.cpa_alert_threshold !== null &&
      cpaThisWeek >= a.cpa_alert_threshold
    ) {
      reasons.push("cpa_at_or_above_alert_threshold");
    }

    const acctAlerts = cids.flatMap((id) => alertsByCampaign.get(id) ?? []);

    return {
      id: a.id,
      name: a.name,
      niche: a.niche,
      type: a.type,
      status: a.status,
      price_per_appointment: a.price_per_appointment,
      cpa_alert_threshold: a.cpa_alert_threshold,
      auto_pause_threshold: a.auto_pause_threshold,
      campaign_ids: cids,
      last30d: {
        spend: round(spend30),
        leads: leads30,
        appointments: ap.appts,
        showed: ap.showed,
        revenue: round(ap.revenue),
        margin: round(ap.revenue - spend30),
        cpa: ap.appts > 0 ? round(spend30 / ap.appts) : null,
      },
      // Job-closed revenue loop (Phase 1): actual client-confirmed revenue,
      // collected via SMS follow-up a few days after each appointment —
      // NOT the same as last30d.revenue (that's the pre-filled estimate
      // from price_per_appointment). jobs_pending_reply is how many showed
      // appointments haven't answered yet; true_roi/true_cpa are null
      // whenever there's no closed-job data at all, so the model never
      // fabricates an ROI figure from an empty denominator.
      revenue_data: {
        appointments_showed_30d: showed30,
        jobs_closed_30d: jobsClosed30,
        jobs_not_closed_30d: jobsNotClosed30,
        jobs_pending_reply_30d: jobsPending30,
        reply_rate_pct: jobsAnswered30 > 0 ? pctRound(jobsAnswered30 / showed30) : null,
        closed_revenue_30d: round(closedRevenue30),
        true_roi_30d: jobsClosed30 > 0 ? round(closedRevenue30 - spend30) : null,
        true_cpa_per_closed_job_30d: jobsClosed30 > 0 ? round(spend30 / jobsClosed30) : null,
        data_complete: jobsPending30 === 0 && showed30 > 0,
      },
      week_over_week: {
        this_week: {
          spend: round(spendThisWeek),
          leads: leadsThisWeek,
          appointments: apptsThisWeek,
          cpa: cpaThisWeek !== null ? round(cpaThisWeek) : null,
        },
        last_week: {
          spend: round(spendLastWeek),
          leads: leadsLastWeek,
          appointments: apptsLastWeek,
          cpa: cpaLastWeek !== null ? round(cpaLastWeek) : null,
        },
      },
      month_over_month: {
        this_month: {
          spend: round(spendThisMonth),
          leads: leadsThisMonth,
          appointments: apptsThisMonth,
          cpa: cpaThisMonth !== null ? round(cpaThisMonth) : null,
        },
        last_month: {
          spend: round(spendLastMonth),
          leads: leadsLastMonth,
          appointments: apptsLastMonth,
          cpa: cpaLastMonth !== null ? round(cpaLastMonth) : null,
        },
      },
      activity: {
        days_since_last_lead: daysSinceLastLead,
        days_since_last_appointment: daysSinceLastAppt,
      },
      risk_assessment: {
        at_risk: reasons.length > 0,
        reasons,
      },
      unacknowledged_alerts: acctAlerts,
    };
  });

  // ---- Per-campaign 7d snapshot (kept for campaign-level questions) ----
  const campaignSummaries = (campaigns ?? []).map((c) => {
    const agg = cAgg.get(c.id) ?? ensureC(c.id);
    const cpaThisWeek = agg.apptsThisWeek > 0 ? agg.spendThisWeek / agg.apptsThisWeek : null;
    const cpaLastWeek = agg.apptsLastWeek > 0 ? agg.spendLastWeek / agg.apptsLastWeek : null;
    return {
      id: c.id,
      name: c.name,
      account: accountById.get(c.account_id)?.name ?? null,
      account_id: c.account_id,
      status: c.status,
      last7d_spend: round(agg.spend7),
      last30d_leads: agg.leads30,
      last30d_appointments: agg.appts30,
      last30d_cpa: agg.appts30 > 0 ? round(agg.spend30 / agg.appts30) : null,
      revenue_data: {
        jobs_closed_30d: agg.jobsClosed30,
        jobs_pending_reply_30d: agg.jobsPending30,
        closed_revenue_30d: round(agg.closedRevenue30),
        true_roi_30d: agg.jobsClosed30 > 0 ? round(agg.closedRevenue30 - agg.spend30) : null,
      },
      week_over_week: {
        this_week: {
          spend: round(agg.spendThisWeek),
          leads: agg.leadsThisWeek,
          appointments: agg.apptsThisWeek,
          cpa: cpaThisWeek !== null ? round(cpaThisWeek) : null,
        },
        last_week: {
          spend: round(agg.spendLastWeek),
          leads: agg.leadsLastWeek,
          appointments: agg.apptsLastWeek,
          cpa: cpaLastWeek !== null ? round(cpaLastWeek) : null,
        },
      },
    };
  });

  // ---- Creatives: full table + rolled-up performance across attached campaigns ----
  const creativeCampaignIds = new Map<string, string[]>();
  for (const j of campaignCreatives ?? []) {
    const arr = creativeCampaignIds.get(j.creative_id) ?? [];
    arr.push(j.campaign_id);
    creativeCampaignIds.set(j.creative_id, arr);
  }
  const creativeSummaries = (creatives ?? []).map((cr) => {
    const cids = creativeCampaignIds.get(cr.id) ?? [];
    const usedInCampaigns = cids
      .map((id) => campaignById.get(id)?.name)
      .filter((n): n is string => !!n);
    const spend30 = cids.reduce((s, id) => s + (cAgg.get(id)?.spend30 ?? 0), 0);
    const appts30 = cids.reduce((s, id) => s + (cAgg.get(id)?.appts30 ?? 0), 0);
    const spendThisWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.spendThisWeek ?? 0), 0);
    const spendLastWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.spendLastWeek ?? 0), 0);
    const apptsThisWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.apptsThisWeek ?? 0), 0);
    const apptsLastWeek = cids.reduce((s, id) => s + (cAgg.get(id)?.apptsLastWeek ?? 0), 0);
    const cpaThisWeek = apptsThisWeek > 0 ? spendThisWeek / apptsThisWeek : null;
    const cpaLastWeek = apptsLastWeek > 0 ? spendLastWeek / apptsLastWeek : null;
    const jobsClosed30 = cids.reduce((s, id) => s + (cAgg.get(id)?.jobsClosed30 ?? 0), 0);
    const jobsPending30 = cids.reduce((s, id) => s + (cAgg.get(id)?.jobsPending30 ?? 0), 0);
    const closedRevenue30 = cids.reduce((s, id) => s + (cAgg.get(id)?.closedRevenue30 ?? 0), 0);
    return {
      id: cr.id,
      name: cr.name,
      type: cr.type,
      status: cr.status,
      account: accountById.get(cr.account_id)?.name ?? null,
      account_id: cr.account_id,
      used_in_campaigns: usedInCampaigns,
      campaign_ids: cids,
      last30d: {
        spend: round(spend30),
        appointments: appts30,
        cpa: appts30 > 0 ? round(spend30 / appts30) : null,
      },
      revenue_data: {
        jobs_closed_30d: jobsClosed30,
        jobs_pending_reply_30d: jobsPending30,
        closed_revenue_30d: round(closedRevenue30),
        true_roi_30d: jobsClosed30 > 0 ? round(closedRevenue30 - spend30) : null,
      },
      week_over_week: {
        this_week: { cpa: cpaThisWeek !== null ? round(cpaThisWeek) : null },
        last_week: { cpa: cpaLastWeek !== null ? round(cpaLastWeek) : null },
      },
      has_performance_data: cids.length > 0 && spend30 > 0,
    };
  });

  // ---- Weekly internal vs client (unchanged shape, still useful for the top-line view) ----
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

  // ---- Outreach: per-script funnel + this-week/last-week contact volume ----
  const contactsByScript = new Map<
    string,
    { status: Database["public"]["Enums"]["outreach_contact_status"] }[]
  >();
  const scriptVolume = new Map<string, { thisWeek: number; lastWeek: number }>();
  for (const ct of contacts ?? []) {
    if (!ct.script_id) continue;
    const arr = contactsByScript.get(ct.script_id) ?? [];
    arr.push({ status: ct.status });
    contactsByScript.set(ct.script_id, arr);

    const v = scriptVolume.get(ct.script_id) ?? { thisWeek: 0, lastWeek: 0 };
    const d = ct.created_at.slice(0, 10);
    if (d >= weekStart) v.thisWeek += 1;
    else if (d >= lastWeekStart) v.lastWeek += 1;
    scriptVolume.set(ct.script_id, v);
  }
  const scriptSummaries = (scripts ?? []).map((sc) => {
    const f = computeFunnel(contactsByScript.get(sc.id) ?? []);
    const v = scriptVolume.get(sc.id) ?? { thisWeek: 0, lastWeek: 0 };
    return {
      id: sc.id,
      name: sc.name,
      channel: sc.channel,
      status: sc.status,
      contacted_total: f.contacted,
      contacted_this_week: v.thisWeek,
      contacted_last_week: v.lastWeek,
      reply_rate_pct: pctRound(f.replyRate),
      call_booked_rate_pct: pctRound(f.callBookedRate),
      close_rate_pct: pctRound(f.closeRate),
    };
  });
  const outreachTotals = {
    contacted_this_week: (scripts ?? []).reduce(
      (s, sc) => s + (scriptVolume.get(sc.id)?.thisWeek ?? 0),
      0,
    ),
    contacted_last_week: (scripts ?? []).reduce(
      (s, sc) => s + (scriptVolume.get(sc.id)?.lastWeek ?? 0),
      0,
    ),
  };

  return {
    context:
      "MAKI Ops — marketing agency internal dashboard. 'internal' accounts are MAKI's own client-acquisition ads; 'client' accounts are ads MAKI runs for clients. Money is USD. This snapshot is the ONLY data available — nothing outside it is known.",
    generated_at: new Date(now).toISOString(),
    periods: {
      today: todayIso,
      this_week_start: weekStart,
      last_week_start: lastWeekStart,
      this_month_start: thisMonthStart,
      last_month_start: lastMonthStart,
      rollup_window_days: 30,
      at_risk_no_activity_threshold_days: NO_ACTIVITY_THRESHOLD_DAYS,
    },
    accounts: accountSummaries,
    campaigns: campaignSummaries,
    creatives: creativeSummaries,
    weekly_by_context: weekAgg,
    outreach_scripts: scriptSummaries,
    outreach_totals: outreachTotals,
    unacknowledged_alerts: (alerts ?? []).map((a) => ({
      type: a.type,
      message: a.message,
      campaign: campaignById.get(a.campaign_id)?.name ?? null,
      campaign_id: a.campaign_id,
    })),
  };
}

/**
 * Narrows a full snapshot down to one account — used by Focus Spaces (and
 * Analyst Mode run inside a Space) so a scoped conversation only ever sees
 * that account's data, not the whole business. Computed by filtering the
 * already-aggregated snapshot rather than re-querying, since the rollups
 * are cheap in-memory work once fetched.
 */
export function scopeSnapshotToAccount(
  data: Awaited<ReturnType<typeof getInsightsData>>,
  accountId: string,
): Awaited<ReturnType<typeof getInsightsData>> {
  const accountCampaignIds = new Set(
    data.campaigns.filter((c) => c.account_id === accountId).map((c) => c.id),
  );
  return {
    ...data,
    accounts: data.accounts.filter((a) => a.id === accountId),
    campaigns: data.campaigns.filter((c) => c.account_id === accountId),
    creatives: data.creatives.filter((c) => c.account_id === accountId),
    unacknowledged_alerts: data.unacknowledged_alerts.filter(
      (a) => a.campaign_id && accountCampaignIds.has(a.campaign_id),
    ),
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
