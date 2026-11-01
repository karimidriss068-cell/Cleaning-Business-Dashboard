// Growth, part 2: the 12-month north star. Tiers and their pace, monthly profit,
// the forecast for each tier, the go/no-go gates and the hire triggers. Pure
// functions over the numbers the database gathers (growth_inputs), like growth.ts.
// Money is integer cents; dates are New York calendar dates.

import { addMonths, adMetrics, capacity, monthStartOf, monthsBetween, paceForMonth, planNeeds, type Pace } from "@/lib/growth";
import type { GrowthInputs, MonthRow, TierKey } from "@/lib/schemas/growth";

export const HORIZON_MONTHS = 12;
/** Commercial accounts without a stated visit count are assumed to be cleaned this many times a month. */
export const DEFAULT_COMMERCIAL_VISITS = 4;
const WEEKS_PER_MONTH = 52 / 12;

export const tierLabel: Record<TierKey, string> = { base: "Base", strong: "Strong", north_star: "North star" };
export const tierMetric: Record<TierKey, "revenue" | "profit"> = { base: "revenue", strong: "revenue", north_star: "profit" };
const ceil1 = (n: number) => Math.ceil(n * 10) / 10;

// Profit ------------------------------------------------------------------------

export type ProfitMonth = {
  monthStart: string;
  revenueCents: number;
  /** What the cleaners earned on visits completed that month (their pay snapshot). */
  subPayCents: number | null;
  adSpendCents: number;
  otherCostsCents: number | null;
  netProfitCents: number | null;
  /** Net profit as basis points of revenue (can be negative); null with no revenue. */
  marginBps: number | null;
};

export function profitMonth(m: MonthRow): ProfitMonth {
  const known = m.subPayCents !== null && m.otherCostsCents !== null;
  const net = known ? m.revenueCents - (m.subPayCents ?? 0) - m.adSpendCents - (m.otherCostsCents ?? 0) : null;
  return {
    monthStart: m.monthStart,
    revenueCents: m.revenueCents,
    subPayCents: m.subPayCents,
    adSpendCents: m.adSpendCents,
    otherCostsCents: m.otherCostsCents,
    netProfitCents: net,
    marginBps: net !== null && m.revenueCents > 0 ? Math.round((net * 10000) / m.revenueCents) : null,
  };
}

// Tiers -------------------------------------------------------------------------

/** Where the plan month is on the 12-month ramp: 0 before the start, 1 to 12 during, and 12 after. */
export function planMonthOf(today: string, startDate: string): number {
  const idx = monthsBetween(monthStartOf(startDate), monthStartOf(today)) + 1;
  return Math.min(HORIZON_MONTHS, Math.max(0, idx));
}

/**
 * The share of the full target each plan month should reach (index 0 to 12).
 * It follows the gates: the revenue the gates ask for at months 3, 6 and 9 as a
 * share of the base tier, joined by straight lines, with month 12 at 100%.
 */
export function rampShares(gates: GrowthInputs["gateCriteria"], baseTierCents: number): number[] {
  const anchors: [number, number][] = [[0, 0]];
  for (const [cp, month] of [["month3", 3], ["month6", 6], ["month9", 9]] as const) {
    const g = gates.find((x) => x.checkpoint === cp && x.metric === "month_revenue_cents" && x.enabled);
    if (g && baseTierCents > 0) anchors.push([month, Math.min(1, g.threshold / baseTierCents)]);
  }
  anchors.push([HORIZON_MONTHS, 1]);
  anchors.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (let m = 0; m <= HORIZON_MONTHS; m++) {
    const hi = anchors.findIndex((a) => a[0] >= m);
    const [m1, v1] = anchors[hi];
    if (m1 === m || hi === 0) {
      out.push(v1);
      continue;
    }
    const [m0, v0] = anchors[hi - 1];
    out.push(v0 + ((v1 - v0) * (m - m0)) / (m1 - m0));
  }
  return out;
}

export type TierPace = {
  tier: TierKey;
  label: string;
  metric: "revenue" | "profit";
  selected: boolean;
  /** The full monthly target at month 12. */
  fullTargetCents: number;
  /** What this month should reach on the ramp. */
  monthTargetCents: number;
  /** This month's revenue (base, strong) or net profit (north star); null if hidden from the viewer. */
  actualCents: number | null;
  pace: Pace | null;
  /** This month's figure as a share of the full target, whole percent. */
  percentOfFull: number | null;
};

export const tierFullTarget = (e: GrowthInputs["settingsExtra"], tier: TierKey) =>
  tier === "base" ? e.tierBaseRevenueCents : tier === "strong" ? e.tierStrongRevenueCents : e.tierNorthProfitCents;

export function tierPaces(args: {
  extra: GrowthInputs["settingsExtra"];
  gates: GrowthInputs["gateCriteria"];
  startDate: string;
  today: string;
  monthStart: string;
  nextMonthStart: string;
  revenueCents: number;
  profitCents: number | null;
}): TierPace[] {
  const { extra, gates, startDate, today, monthStart, nextMonthStart, revenueCents, profitCents } = args;
  const shares = rampShares(gates, extra.tierBaseRevenueCents);
  const month = planMonthOf(today, startDate);
  return (["base", "strong", "north_star"] as const).map((tier) => {
    const full = tierFullTarget(extra, tier);
    const target = month === 0 ? 0 : Math.round(full * shares[month]);
    const actual = tierMetric[tier] === "revenue" ? revenueCents : profitCents;
    return {
      tier,
      label: tierLabel[tier],
      metric: tierMetric[tier],
      selected: extra.tier === tier,
      fullTargetCents: full,
      monthTargetCents: target,
      actualCents: actual,
      pace: actual === null ? null : paceForMonth({ today, monthStart, nextMonthStart, targetCents: target, revenueCents: actual }),
      percentOfFull: actual === null || full <= 0 ? null : Math.round((actual / full) * 100),
    };
  });
}

// Forecast ----------------------------------------------------------------------

export type Forecast = {
  tier: TierKey;
  label: string;
  /** Monthly revenue needed at month 12 (for the profit tier: profit target divided by the margin assumption). */
  revenueCents: number;
  residentialClients: number;
  commercialAccounts: number;
  clients: number;
  cleansPerWeek: number;
  crews: number;
  /** Clients to win over the 12 months, including replacing the ones who churn. */
  winsNeeded: number;
  leadsPerWeek: number;
  /** Average monthly ad budget to win them at the assumed cost per client. */
  adBudgetMonthlyCents: number;
  clientsToAdd: number;
  crewsToAdd: number;
};

/**
 * What each tier takes. Revenue splits residential/commercial like the plan's
 * own targets; clients, cleans a week and crews follow from the price, visits
 * and per-crew assumptions. Churn is replaced on top: the client base ramps up,
 * so on average half of the final base is exposed to churn each month.
 */
export function forecastTier(tier: TierKey, inputs: GrowthInputs, crewsHave: number, clientsHave: number): Forecast {
  const s = inputs.settings;
  const e = inputs.settingsExtra;
  const full = tierFullTarget(e, tier);
  const revenueCents = tier === "north_star" ? Math.ceil((full * 10000) / s.marginBps) : full;
  const totalTarget = s.residentialTargetCents + s.commercialTargetCents;
  // Integer cents all the way, so a split like 64/36 can't drift a cent into an extra client.
  const resRevenue = totalTarget > 0 ? Math.round((revenueCents * s.residentialTargetCents) / totalTarget) : revenueCents;
  const residentialClients = Math.ceil(resRevenue / (s.resVisitPriceCents * s.resVisitsPerMonth));
  const commercialAccounts = Math.ceil((revenueCents - resRevenue) / s.commAccountValueCents);
  const clients = residentialClients + commercialAccounts;
  const cleansPerWeek = ceil1(((residentialClients * s.resVisitsPerMonth + commercialAccounts * DEFAULT_COMMERCIAL_VISITS) / WEEKS_PER_MONTH));
  const crews = Math.ceil(cleansPerWeek / e.cleansPerCrewPerWeek);
  const winsNeeded = Math.ceil(clients + ((e.monthlyChurnBps / 10000) * (clients / 2) * HORIZON_MONTHS));
  const leads = Math.ceil((winsNeeded * 10000) / s.closeRateBps);
  return {
    tier,
    label: tierLabel[tier],
    revenueCents,
    residentialClients,
    commercialAccounts,
    clients,
    cleansPerWeek,
    crews,
    winsNeeded,
    leadsPerWeek: ceil1(leads / 52),
    adBudgetMonthlyCents: Math.ceil((winsNeeded * s.cacCents) / HORIZON_MONTHS),
    clientsToAdd: Math.max(0, clients - clientsHave),
    crewsToAdd: Math.max(0, crews - crewsHave),
  };
}

/** Crews you have: the active crews, or half the active cleaners (rounded up) when none are set up. */
export function crewsHave(activeCrews: number, activeCleaners: number): number {
  return activeCrews > 0 ? activeCrews : Math.ceil(activeCleaners / 2);
}

// Gates -------------------------------------------------------------------------

export type GateCheckpoint = "day30" | "month3" | "month6" | "month9" | "month12";
export type GateMetric = GrowthInputs["gateCriteria"][number]["metric"];
export type GateStatus = "passed" | "on_track" | "missed";
export type CriterionState = "met" | "pending" | "missed" | "unknown";

export const CHECKPOINTS: { key: GateCheckpoint; label: string }[] = [
  { key: "day30", label: "Day 30" },
  { key: "month3", label: "Month 3" },
  { key: "month6", label: "Month 6" },
  { key: "month9", label: "Month 9" },
  { key: "month12", label: "Month 12" },
];

export const gateMetricInfo: Record<GateMetric, { label: string; unit: "cents" | "minutes" | "count" | "bps" | "tenths" | "tier"; compare: "gte" | "lt" | "lte" }> = {
  channels_judged: { label: "Channels judged in the ad test", unit: "count", compare: "gte" },
  reply_minutes: { label: "Median lead reply time", unit: "minutes", compare: "lt" },
  clients_booked: { label: "Clients booked since the start", unit: "count", compare: "gte" },
  month_revenue_cents: { label: "Revenue in the month", unit: "cents", compare: "gte" },
  cost_to_win_cents: { label: "Cost to win a client", unit: "cents", compare: "lte" },
  payback_tenths: { label: "CAC payback (months)", unit: "tenths", compare: "lt" },
  margin_bps: { label: "Net margin in the month", unit: "bps", compare: "gte" },
  base_tier_revenue: { label: "Base tier monthly revenue", unit: "tier", compare: "gte" },
};

export type CriterionResult = {
  metric: GateMetric;
  label: string;
  threshold: number;
  /** In the metric's own unit (cents, minutes, count, basis points, tenths); null with no data. */
  value: number | null;
  state: CriterionState;
  enabled: boolean;
  /** Hidden from this viewer (owner/admin only), so it can't pass or fail the gate for them. */
  hidden: boolean;
};
export type GateResult = {
  checkpoint: GateCheckpoint;
  label: string;
  /** The day this gate is judged. */
  dueOn: string;
  status: GateStatus;
  criteria: CriterionResult[];
};

export const gateDueOn = (startDate: string, checkpoint: GateCheckpoint): string => {
  if (checkpoint === "day30") return addMonthsDays(startDate, 30);
  const k = Number(checkpoint.slice(5));
  return addMonths(monthStartOf(startDate), k);
};
function addMonthsDays(date: string, days: number): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const meets = (compare: "gte" | "lt" | "lte", value: number, threshold: number) => (compare === "gte" ? value >= threshold : compare === "lt" ? value < threshold : value <= threshold);

/**
 * Each gate is passed (every criterion met, even early), missed (its day has
 * arrived and one is not met) or on track (not due yet). Numbers come from real
 * data; where there is none (no replied leads, fewer than 3 bookings for a real
 * cost per client) the criterion has no value and counts as not met at the due day.
 */
export function evaluateGates(inputs: GrowthInputs, channelsJudged: number, profit: ProfitMonth[] | null): GateResult[] {
  const s = inputs.settings;
  const e = inputs.settingsExtra;
  const needs = planNeeds(s);
  const ads = adMetrics(inputs, needs);
  const startMonth = monthStartOf(s.startDate);
  const monthRow = (k: number) => inputs.months.find((m) => m.monthStart === addMonths(startMonth, k - 1));
  const profitRow = (k: number) => profit?.find((m) => m.monthStart === addMonths(startMonth, k - 1));
  return CHECKPOINTS.map(({ key, label }) => {
    const month = key === "day30" ? 0 : Number(key.slice(5));
    const dueOn = gateDueOn(s.startDate, key);
    const due = inputs.today >= dueOn;
    const criteria = inputs.gateCriteria
      .filter((g) => g.checkpoint === key)
      .map<CriterionResult>((g) => {
        const info = gateMetricInfo[g.metric as GateMetric];
        const metric = g.metric as GateMetric;
        let value: number | null = null;
        let hidden = false;
        switch (metric) {
          case "channels_judged":
            value = channelsJudged;
            break;
          case "reply_minutes":
            value = inputs.reply.medianMinutes;
            break;
          case "clients_booked":
            value = inputs.wonSincePlanStart;
            break;
          case "month_revenue_cents":
            value = monthRow(month)?.revenueCents ?? 0;
            break;
          case "cost_to_win_cents":
            value = ads.cacSource === "actual" ? ads.cacCents : null;
            break;
          case "payback_tenths":
            value = ads.cacSource === "actual" && ads.paybackMonths !== null ? Math.round(ads.paybackMonths * 10) : null;
            break;
          case "margin_bps": {
            hidden = profit === null;
            value = hidden ? null : (profitRow(month)?.marginBps ?? null);
            break;
          }
          case "base_tier_revenue":
            value = monthRow(month)?.revenueCents ?? 0;
            break;
        }
        const threshold = info.unit === "tier" ? e.tierBaseRevenueCents : g.threshold;
        const ok = value !== null && meets(info.compare, value, threshold);
        const state: CriterionState = hidden ? "unknown" : ok ? "met" : due ? "missed" : value === null ? "unknown" : "pending";
        return { metric, label: info.label, threshold, value, state, enabled: g.enabled, hidden };
      });
    const live = criteria.filter((c) => c.enabled && !c.hidden);
    const status: GateStatus =
      live.length > 0 && live.every((c) => c.state === "met") ? "passed" : due && live.some((c) => c.state === "missed") ? "missed" : "on_track";
    return { checkpoint: key, label, dueOn, status, criteria };
  });
}

// Hire triggers -----------------------------------------------------------------

export type HireTrigger = { key: "clients" | "leads_per_week" | "crews_short"; label: string; threshold: number; enabled: boolean; value: number; lit: boolean; unit: string };

/** A trigger lights up when its number reaches the threshold you set. */
export function hireTriggers(inputs: GrowthInputs, crewsOnHand: number): HireTrigger[] {
  const cap = capacity(inputs);
  const clients = inputs.clients.residentialActive + inputs.clients.commercial.accounts;
  const crewsNeeded = Math.ceil(cap.neededPerWeek / inputs.settingsExtra.cleansPerCrewPerWeek);
  const values: Record<HireTrigger["key"], { value: number; unit: string }> = {
    clients: { value: clients, unit: "clients" },
    leads_per_week: { value: Math.round((inputs.leads.last28 / 4) * 10) / 10, unit: "leads a week" },
    crews_short: { value: Math.max(0, crewsNeeded - crewsOnHand), unit: "crews short" },
  };
  return inputs.hireTriggers.map((t) => {
    const key = t.key as HireTrigger["key"];
    const v = values[key];
    return { key, label: t.label, threshold: t.threshold, enabled: t.enabled, value: v.value, unit: v.unit, lit: t.enabled && v.value >= t.threshold };
  });
}
