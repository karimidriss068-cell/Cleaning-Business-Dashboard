import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { computeDailyDigest, type DigestFindingType } from "@/lib/insights-digest";

const DAY = 86400000;

export type PriorityCategory = DigestFindingType | "no_show_risk" | "scale_winner";

export type PriorityItem = {
  accountId: string | null;
  accountName: string | null;
  category: PriorityCategory;
  message: string;
  /** Rough dollar estimate where calculable, null otherwise (see each
   * category's comment for the exact math — never invented). */
  estimatedImpact: number | null;
};

/**
 * Phase 4 — the prioritization engine. Ties together everything computed
 * elsewhere (digest findings, now impact-annotated; plus two categories
 * that don't fit the digest's "daily flag" framing) into one ranked list
 * of concrete, dollar-quantified-where-possible actions across the WHOLE
 * business. Recomputed fresh on demand rather than read from the stored
 * insights_digest table, since this needs the underlying numbers
 * (estimatedImpact isn't persisted — the stored digest is a point-in-time
 * notification log, this is a live ranking).
 */
export async function computePriorities(supabase: SupabaseClient<Database>): Promise<PriorityItem[]> {
  const [digestFindings, noShowItems, scaleItems] = await Promise.all([
    computeDailyDigest(supabase),
    computeNoShowRisk(supabase),
    computeScaleWinners(supabase),
  ]);

  const items: PriorityItem[] = [
    ...digestFindings.map((f) => ({
      accountId: f.accountId,
      accountName: f.accountName,
      category: f.findingType as PriorityCategory,
      message: f.message,
      estimatedImpact: f.estimatedImpact,
    })),
    ...noShowItems,
    ...scaleItems,
  ];

  // Highest dollar impact first; items with no defensible number sort last
  // (they're still real, actionable items — just not ones we'll put a
  // fabricated price tag on).
  items.sort((a, b) => {
    if (a.estimatedImpact === null && b.estimatedImpact === null) return 0;
    if (a.estimatedImpact === null) return 1;
    if (b.estimatedImpact === null) return -1;
    return b.estimatedImpact - a.estimatedImpact;
  });

  return items;
}

/** No-shows in the last 30 days, per account — appointments that were
 * booked (and priced) but never happened. Impact: count × the account's
 * own price_per_appointment, the same "one appointment's worth of value"
 * read used for ghost leads. */
async function computeNoShowRisk(supabase: SupabaseClient<Database>): Promise<PriorityItem[]> {
  const since30Iso = new Date(Date.now() - 30 * DAY).toISOString();
  const [{ data: appts }, { data: accounts }] = await Promise.all([
    supabase.from("appointments").select("account_id").eq("status", "no_show").gte("booked_at", since30Iso),
    supabase.from("accounts").select("id, name, price_per_appointment").eq("status", "active"),
  ]);
  if (!appts || appts.length === 0) return [];

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const countByAccount = new Map<string, number>();
  for (const ap of appts) {
    countByAccount.set(ap.account_id, (countByAccount.get(ap.account_id) ?? 0) + 1);
  }

  const items: PriorityItem[] = [];
  for (const [accountId, count] of countByAccount) {
    if (count < 2) continue; // one stray no-show isn't a pattern worth flagging
    const account = accountById.get(accountId);
    if (!account) continue;
    const impact = account.price_per_appointment ? Math.round(account.price_per_appointment * count) : null;
    items.push({
      accountId,
      accountName: account.name,
      category: "no_show_risk",
      message: `${account.name} had ${count} no-shows in the last 30 days — tightening confirmations/reminders could recover this booked-but-wasted consult value.`,
      estimatedImpact: impact,
    });
  }
  return items;
}

/** Creatives already tagged 'winning' whose 30d CPA is comfortably under
 * the account's own alert threshold — the account can absorb more spend on
 * them before hitting its own guardrail. Deliberately no dollar estimate:
 * "how much more would we make by scaling" depends on a spend-elasticity
 * assumption this app has no basis for, so it stays a flagged action
 * rather than an invented number. */
async function computeScaleWinners(supabase: SupabaseClient<Database>): Promise<PriorityItem[]> {
  const since30 = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const [{ data: creatives }, { data: accounts }, { data: campaigns }, { data: spend }, { data: appts }] =
    await Promise.all([
      supabase.from("creatives").select("id, name, status, account_id").eq("status", "winning"),
      supabase.from("accounts").select("id, name, cpa_alert_threshold").eq("status", "active"),
      supabase.from("campaigns").select("id, account_id"),
      supabase.from("spend_daily").select("campaign_id, date, spend").gte("date", since30),
      supabase.from("appointments").select("account_id, booked_at").gte("booked_at", since30),
    ]);
  if (!creatives || creatives.length === 0) return [];

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  // Creatives have no direct per-campaign performance breakdown in this
  // schema, so this approximates at the account level: is the account's
  // overall CPA comfortably under its own threshold while this creative is
  // tagged 'winning'? Good enough for a "candidate to scale" signal — not
  // claiming this specific creative's isolated CPA.
  const campaignAccount = new Map((campaigns ?? []).map((c) => [c.id, c.account_id]));
  const spendByAccount = new Map<string, number>();
  for (const s of spend ?? []) {
    const accountId = campaignAccount.get(s.campaign_id);
    if (!accountId) continue;
    spendByAccount.set(accountId, (spendByAccount.get(accountId) ?? 0) + Number(s.spend ?? 0));
  }
  const apptsByAccount = new Map<string, number>();
  for (const ap of appts ?? []) {
    apptsByAccount.set(ap.account_id, (apptsByAccount.get(ap.account_id) ?? 0) + 1);
  }

  const items: PriorityItem[] = [];
  for (const cr of creatives) {
    const account = accountById.get(cr.account_id);
    if (!account?.cpa_alert_threshold) continue;
    const accountSpend = spendByAccount.get(cr.account_id) ?? 0;
    const accountAppts = apptsByAccount.get(cr.account_id) ?? 0;
    if (accountAppts === 0) continue;
    const accountCpa = accountSpend / accountAppts;
    if (accountCpa <= 0 || accountCpa > account.cpa_alert_threshold * 0.7) continue;
    items.push({
      accountId: cr.account_id,
      accountName: account.name,
      category: "scale_winner",
      message: `${cr.name} (${account.name}) is a winning creative running comfortably under the account's cost-per-consult threshold — a candidate to scale with more budget.`,
      estimatedImpact: null,
    });
  }
  return items;
}
