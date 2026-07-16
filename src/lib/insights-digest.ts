import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { currentWeekRange, money } from "@/lib/format";
import { getUncontactedLeads } from "@/lib/lead-response";

const DAY = 86400000;

export type DigestFindingType =
  | "zero_leads"
  | "cpa_above_threshold"
  | "creative_cpa_spike"
  | "ghost_leads"
  | "slow_response";

export type DigestFinding = {
  accountId: string;
  accountName: string;
  campaignId: string | null;
  creativeId: string | null;
  findingType: DigestFindingType;
  message: string;
  /** Rough dollar impact where calculable from existing numbers (never
   * invented) — feeds the Phase 4 prioritization engine. Null when there's
   * no defensible way to put a number on it (e.g. "zero leads" — there's no
   * historical baseline to estimate a lost-revenue figure from). */
  estimatedImpact: number | null;
};

/**
 * The three checks the daily digest surfaces, each read from the same data
 * already tracked elsewhere in the app (no new threshold concept invented):
 *   1. An active account with no new leads in 7+ days.
 *   2. An active campaign whose rolling-7-day CPA is at/above its account's
 *      existing cpa_alert_threshold (the same threshold check-thresholds
 *      already enforces on a 3-day window — this is a slower, informational
 *      companion, not a duplicate alert).
 *   3. A creative (rolled up across the campaigns it's used in, same as the
 *      /insights snapshot) whose CPA has climbed 20%+ week over week.
 */
export async function computeDailyDigest(
  supabase: SupabaseClient<Database>,
): Promise<DigestFinding[]> {
  const now = Date.now();
  const { weekStart } = currentWeekRange();
  const lastWeekStart = new Date(new Date(weekStart).getTime() - 7 * DAY)
    .toISOString()
    .slice(0, 10);
  const since7Date = new Date(now - 7 * DAY).toISOString().slice(0, 10);

  const [
    { data: accounts },
    { data: campaigns },
    { data: creatives },
    { data: campaignCreatives },
    { data: spend },
    { data: leads },
    { data: appts },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, status, cpa_alert_threshold, price_per_appointment")
      .eq("status", "active"),
    supabase.from("campaigns").select("id, name, account_id, status").eq("status", "active"),
    supabase.from("creatives").select("id, name, status, account_id").neq("status", "retired"),
    supabase.from("campaign_creatives").select("campaign_id, creative_id"),
    supabase.from("spend_daily").select("campaign_id, date, spend").gte("date", lastWeekStart),
    supabase.from("leads").select("id, campaign_id, created_at").gte("created_at", lastWeekStart),
    supabase.from("appointments").select("lead_id, booked_at").gte("booked_at", lastWeekStart),
  ]);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const leadCampaign = new Map((leads ?? []).map((l) => [l.id, l.campaign_id]));

  type Agg = { spendThisWeek: number; spendLastWeek: number; apptsThisWeek: number; apptsLastWeek: number };
  const agg = new Map<string, Agg>();
  const ensure = (id: string): Agg => {
    if (!agg.has(id)) agg.set(id, { spendThisWeek: 0, spendLastWeek: 0, apptsThisWeek: 0, apptsLastWeek: 0 });
    return agg.get(id)!;
  };
  for (const s of spend ?? []) {
    const a = ensure(s.campaign_id);
    if (s.date >= weekStart) a.spendThisWeek += Number(s.spend ?? 0);
    else if (s.date >= lastWeekStart) a.spendLastWeek += Number(s.spend ?? 0);
  }
  for (const ap of appts ?? []) {
    const cid = leadCampaign.get(ap.lead_id);
    if (!cid) continue;
    const a = ensure(cid);
    const d = ap.booked_at.slice(0, 10);
    if (d >= weekStart) a.apptsThisWeek += 1;
    else if (d >= lastWeekStart) a.apptsLastWeek += 1;
  }

  const lastLeadByAccount = new Map<string, string>();
  for (const l of leads ?? []) {
    const c = l.campaign_id ? campaignById.get(l.campaign_id) : null;
    if (!c) continue;
    const d = l.created_at.slice(0, 10);
    const cur = lastLeadByAccount.get(c.account_id);
    if (!cur || d > cur) lastLeadByAccount.set(c.account_id, d);
  }

  const findings: DigestFinding[] = [];

  // 1. Accounts with 0 leads in 7+ days.
  for (const a of accounts ?? []) {
    const last = lastLeadByAccount.get(a.id);
    if (!last || last < since7Date) {
      findings.push({
        accountId: a.id,
        accountName: a.name,
        campaignId: null,
        creativeId: null,
        findingType: "zero_leads",
        message: last
          ? `${a.name} has had no new leads since ${last} — 7+ days quiet.`
          : `${a.name} has had no new leads in the last 7 days.`,
        // No historical baseline to estimate a lost-revenue figure from —
        // this is a lead-gen problem, not a quantifiable-yet dollar loss.
        estimatedImpact: null,
      });
    }
  }

  // 2. Campaigns whose rolling-7-day CPA is at/above the account's alert threshold.
  for (const c of campaigns ?? []) {
    const account = accountById.get(c.account_id);
    if (!account?.cpa_alert_threshold) continue;
    const a = agg.get(c.id);
    if (!a) continue;
    const cpa7 = a.apptsThisWeek > 0 ? a.spendThisWeek / a.apptsThisWeek : null;
    if (cpa7 !== null && cpa7 >= account.cpa_alert_threshold) {
      // Overspend estimate: how much more this week's appointments cost
      // than they would have at the account's own threshold.
      const overspend = (cpa7 - account.cpa_alert_threshold) * a.apptsThisWeek;
      findings.push({
        accountId: c.account_id,
        accountName: account.name,
        campaignId: c.id,
        creativeId: null,
        findingType: "cpa_above_threshold",
        message: `${c.name}'s CPA this week is ${money(cpa7)}, above ${account.name}'s ${money(account.cpa_alert_threshold)} alert threshold.`,
        estimatedImpact: overspend > 0 ? Math.round(overspend) : null,
      });
    }
  }

  // 3. Creatives (rolled up across their campaigns) with CPA up 20%+ WoW.
  const creativeCampaignIds = new Map<string, string[]>();
  for (const j of campaignCreatives ?? []) {
    const arr = creativeCampaignIds.get(j.creative_id) ?? [];
    arr.push(j.campaign_id);
    creativeCampaignIds.set(j.creative_id, arr);
  }
  for (const cr of creatives ?? []) {
    const cids = (creativeCampaignIds.get(cr.id) ?? []).filter((id) => campaignById.has(id));
    if (cids.length === 0) continue;
    const spendThisWeek = cids.reduce((s, id) => s + (agg.get(id)?.spendThisWeek ?? 0), 0);
    const spendLastWeek = cids.reduce((s, id) => s + (agg.get(id)?.spendLastWeek ?? 0), 0);
    const apptsThisWeek = cids.reduce((s, id) => s + (agg.get(id)?.apptsThisWeek ?? 0), 0);
    const apptsLastWeek = cids.reduce((s, id) => s + (agg.get(id)?.apptsLastWeek ?? 0), 0);
    const cpaThisWeek = apptsThisWeek > 0 ? spendThisWeek / apptsThisWeek : null;
    const cpaLastWeek = apptsLastWeek > 0 ? spendLastWeek / apptsLastWeek : null;
    if (cpaThisWeek !== null && cpaLastWeek !== null && cpaThisWeek >= cpaLastWeek * 1.2) {
      const pctUp = Math.round(((cpaThisWeek - cpaLastWeek) / cpaLastWeek) * 100);
      // Extra spend this week attributable to the CPA rise, at the same
      // appointment volume.
      const excessSpend = (cpaThisWeek - cpaLastWeek) * apptsThisWeek;
      findings.push({
        accountId: cr.account_id,
        accountName: accountById.get(cr.account_id)?.name ?? "That account",
        campaignId: null,
        creativeId: cr.id,
        findingType: "creative_cpa_spike",
        message: `${cr.name}'s CPA is up ${pctUp}% week over week (${money(cpaLastWeek)} → ${money(cpaThisWeek)}).`,
        estimatedImpact: excessSpend > 0 ? Math.round(excessSpend) : null,
      });
    }
  }

  // 4. Lead response monitoring (Phase 2) — grouped per account rather than
  // one finding per lead, so a client with 20 uncontacted leads doesn't
  // flood the digest with 20 rows.
  const uncontacted = await getUncontactedLeads(supabase);
  const byAccount = new Map<string, { critical: number; warning: number; accountName: string }>();
  for (const l of uncontacted) {
    if (!l.accountId) continue;
    const cur = byAccount.get(l.accountId) ?? { critical: 0, warning: 0, accountName: l.accountName ?? "That account" };
    if (l.severity === "critical") cur.critical++;
    else cur.warning++;
    byAccount.set(l.accountId, cur);
  }
  for (const [accountId, v] of byAccount) {
    const pricePerAppt = accountById.get(accountId)?.price_per_appointment ?? null;
    if (v.critical > 0) {
      findings.push({
        accountId,
        accountName: v.accountName,
        campaignId: null,
        creativeId: null,
        findingType: "ghost_leads",
        message: `${v.accountName} has ${v.critical} lead${v.critical > 1 ? "s" : ""} uncontacted for 24+ hours — likely lost without follow-up.`,
        // Each ghost lead treated as one missed appointment at this
        // account's usual value — a direct, defensible read of
        // price_per_appointment, not an invented conversion-rate guess.
        estimatedImpact: pricePerAppt ? Math.round(pricePerAppt * v.critical) : null,
      });
    }
    if (v.warning > 0) {
      findings.push({
        accountId,
        accountName: v.accountName,
        campaignId: null,
        creativeId: null,
        findingType: "slow_response",
        message: `${v.accountName} has ${v.warning} lead${v.warning > 1 ? "s" : ""} past the fast-response window, not yet contacted.`,
        // Half weight vs. a ghost lead — these are still recoverable, this
        // is "at elevated risk," not "likely already lost."
        estimatedImpact: pricePerAppt ? Math.round(pricePerAppt * v.warning * 0.5) : null,
      });
    }
  }

  return findings;
}

export type DigestItem = {
  id: string;
  message: string;
  findingType: DigestFindingType;
};

/** Today's digest rows the caller hasn't dismissed yet. Dismissal is
 * per-user (insights_digest_dismissals), the findings themselves are shared
 * team data (insights_digest) — see the migration comment for why. */
export async function getTodaysDigest(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<DigestItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: findings }, { data: dismissals }] = await Promise.all([
    supabase
      .from("insights_digest")
      .select("id, message, finding_type")
      .eq("digest_date", today),
    supabase.from("insights_digest_dismissals").select("digest_id").eq("user_id", userId),
  ]);

  const dismissedIds = new Set((dismissals ?? []).map((d) => d.digest_id));
  return (findings ?? [])
    .filter((f) => !dismissedIds.has(f.id))
    .map((f) => ({ id: f.id, message: f.message, findingType: f.finding_type }))
    // Ghost leads (critical — a full day+ uncontacted) surface above every
    // other warning-level flag, per the Phase 2 severity requirement.
    .sort((a, b) => (a.findingType === "ghost_leads" ? -1 : 0) - (b.findingType === "ghost_leads" ? -1 : 0));
}

export async function dismissDigestFinding(
  supabase: SupabaseClient<Database>,
  userId: string,
  digestId: string,
): Promise<void> {
  await supabase.from("insights_digest_dismissals").insert({ digest_id: digestId, user_id: userId });
}
