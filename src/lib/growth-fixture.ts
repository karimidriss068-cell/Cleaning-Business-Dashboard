// Test data for the growth rules: a plausible database answer, with the part 2
// numbers (profit months, funnel, gates, channel test) filled in.
import type { GrowthInputs } from "@/lib/schemas/growth";

export const SETTINGS: GrowthInputs["settings"] = {
  startDate: "2026-12-01",
  residentialTargetCents: 640000,
  commercialTargetCents: 360000,
  resVisitPriceCents: 18000,
  resVisitsPerMonth: 2,
  commAccountValueCents: 60000,
  closeRateBps: 2000,
  cacCents: 25000,
  marginBps: 4000,
  monthlyAdBudgetCents: 100000,
  replyTargetMinutes: 5,
  cleansPerCleanerPerWeek: 12,
  startingCapitalCents: 500000,
  cashStartDate: "2026-11-02",
  monthlyFixedCostsCents: 150000,
  minBufferCents: 100000,
};

export const SETTINGS_EXTRA: GrowthInputs["settingsExtra"] = {
  tier: "base",
  tierBaseRevenueCents: 5000000,
  tierStrongRevenueCents: 10000000,
  tierNorthProfitCents: 5000000,
  monthlyChurnBps: 500,
  cleansPerCrewPerWeek: 25,
  testJudgeSpendCents: 75000,
  testJudgeLeads: 20,
  testLoserRatioX100: 150,
  testDailyWeek1Cents: 2000,
  testDailyAfterCents: 3000,
  testWindowWeeks: 4,
  testStartDate: "2026-12-01",
};

export const GATE_CRITERIA: GrowthInputs["gateCriteria"] = [
  { checkpoint: "day30", metric: "channels_judged", threshold: 1, enabled: true },
  { checkpoint: "day30", metric: "reply_minutes", threshold: 5, enabled: true },
  { checkpoint: "day30", metric: "clients_booked", threshold: 3, enabled: true },
  { checkpoint: "month3", metric: "month_revenue_cents", threshold: 400000, enabled: true },
  { checkpoint: "month3", metric: "cost_to_win_cents", threshold: 30000, enabled: true },
  { checkpoint: "month3", metric: "payback_tenths", threshold: 30, enabled: true },
  { checkpoint: "month6", metric: "month_revenue_cents", threshold: 1000000, enabled: true },
  { checkpoint: "month6", metric: "margin_bps", threshold: 3000, enabled: true },
  { checkpoint: "month9", metric: "month_revenue_cents", threshold: 3000000, enabled: true },
  { checkpoint: "month12", metric: "base_tier_revenue", threshold: 0, enabled: true },
];

export const HIRE_TRIGGERS: GrowthInputs["hireTriggers"] = [
  { key: "clients", label: "Add office help", threshold: 30, enabled: true },
  { key: "leads_per_week", label: "Add someone to answer leads", threshold: 15, enabled: true },
  { key: "crews_short", label: "Recruit another crew", threshold: 1, enabled: true },
];

const row = (key: string, leads: number, contacted: number, quoted: number, booked: number, firstClean: number, recurring: number, spendCents: number) => ({
  key,
  leads,
  contacted,
  quoted,
  booked,
  firstClean,
  recurring,
  spendCents,
});

export const EXTENDED: Pick<
  GrowthInputs,
  "settingsExtra" | "months" | "expenses" | "funnel" | "replyBuckets" | "churn" | "channelTest" | "gateCriteria" | "hireTriggers" | "decisions" | "wonSincePlanStart" | "activeCrews" | "cashOnHandCents"
> = {
  settingsExtra: SETTINGS_EXTRA,
  months: [
    { monthStart: "2026-11-01", revenueCents: 300000, adSpendCents: 40000, subPayCents: 120000, otherCostsCents: 20000 },
    { monthStart: "2026-12-01", revenueCents: 50000, adSpendCents: 30000, subPayCents: 20000, otherCostsCents: 10000 },
  ],
  expenses: [],
  funnel: {
    channels: [
      row("meta", 40, 30, 20, 10, 8, 5, 60000),
      row("google_search", 25, 20, 10, 4, 3, 2, 90000),
      row("google_lsa", 0, 0, 0, 0, 0, 0, 0),
      row("referral", 10, 10, 8, 6, 6, 5, 0),
      row("organic", 5, 3, 1, 0, 0, 0, 0),
      row("other", 0, 0, 0, 0, 0, 0, 0),
    ],
    campaigns: [],
    creatives: [],
  },
  replyBuckets: { under5: { leads: 20, booked: 8 }, under60: { leads: 30, booked: 8 }, over60: { leads: 10, booked: 1 }, unanswered: 5 },
  churn: [
    { monthStart: "2026-10-01", startRecurring: 20, cancellations: 1 },
    { monthStart: "2026-11-01", startRecurring: 25, cancellations: 2 },
  ],
  channelTest: {
    fromDate: "2026-12-01",
    channels: [
      { key: "meta", enabled: true, spendCents: 60000, leads: 40, booked: 10, recent: { spendCents: 30000, leads: 20 }, prior: { spendCents: 30000, leads: 20 } },
      { key: "google_search", enabled: true, spendCents: 90000, leads: 25, booked: 4, recent: { spendCents: 45000, leads: 12 }, prior: { spendCents: 45000, leads: 13 } },
      { key: "google_lsa", enabled: true, spendCents: 0, leads: 0, booked: 0, recent: { spendCents: 0, leads: 0 }, prior: { spendCents: 0, leads: 0 } },
      { key: "referral", enabled: false, spendCents: 0, leads: 10, booked: 6, recent: { spendCents: 0, leads: 5 }, prior: { spendCents: 0, leads: 5 } },
      { key: "organic", enabled: false, spendCents: 0, leads: 5, booked: 0, recent: { spendCents: 0, leads: 2 }, prior: { spendCents: 0, leads: 3 } },
      { key: "other", enabled: false, spendCents: 0, leads: 0, booked: 0, recent: { spendCents: 0, leads: 0 }, prior: { spendCents: 0, leads: 0 } },
    ],
  },
  gateCriteria: GATE_CRITERIA,
  hireTriggers: HIRE_TRIGGERS,
  decisions: [],
  wonSincePlanStart: 4,
  activeCrews: 1,
  cashOnHandCents: 670000,
};
