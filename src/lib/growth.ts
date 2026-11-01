// Growth goal rules: the plan arithmetic, pace, ad metrics, capacity, cash and
// the "can I scale spend?" light. Pure functions over the numbers the database
// gathers (growth_inputs), so every rule is unit-tested and the screen, the
// Command Center card and the read-only bot endpoint all show the same figures.
// Money is integer cents; dates are New York calendar dates (YYYY-MM-DD).

import type { GrowthInputs, GrowthSettings } from "@/lib/schemas/growth";

export const PLAN_MONTHS = 6;
/** Within this many days of the month's straight-line pace counts as "on track". */
export const PACE_BAND_DAYS = 2;
/** Capacity warning and the scale light both use 80%. */
export const CAPACITY_WARN = 0.8;
/** Scale light needs CAC to pay back faster than this. */
export const PAYBACK_MAX_MONTHS = 3;
/** The booked-client cost from a handful of bookings is noise; assume until there are this many. */
export const MIN_BOOKED_FOR_ACTUAL_CAC = 3;
const WEEKS_PER_MONTH = 52 / 12;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const ceilDiv = (a: number, b: number) => (b <= 0 ? 0 : Math.ceil(a / b));

// Dates -----------------------------------------------------------------------

const parts = (d: string): [number, number, number] => {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m, day];
};
export const monthStartOf = (d: string) => `${d.slice(0, 8)}01`;
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}
export function monthsBetween(fromMonthStart: string, toMonthStart: string): number {
  const [fy, fm] = parts(fromMonthStart);
  const [ty, tm] = parts(toMonthStart);
  return (ty - fy) * 12 + (tm - fm);
}
/** Calendar months later, with the day clamped to the target month's length (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** "6.5" or "6.5%" -> 650 basis points; null when it is not a number from 0.01 to 100. */
export function percentToBps(input: string): number | null {
  const m = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*%?\s*$/.exec(input);
  if (!m) return null;
  const bps = Math.round(Number(m[1]) * 100);
  return bps >= 1 && bps <= 10000 ? bps : null;
}
export const bpsToPercent = (bps: number): string => String(bps / 100);

// The plan --------------------------------------------------------------------

export type PlanNeeds = {
  /** Recurring residential clients needed to reach the residential target. */
  residential: number;
  /** Commercial accounts needed to reach the commercial target. */
  commercial: number;
  totalClients: number;
  /** Leads to get through the plan at the assumed lead-to-booked rate. */
  leadsTotal: number;
  /** Spread over the plan's weeks, rounded up to a tenth. */
  leadsPerWeek: number;
  /** What winning those clients costs at the assumed cost per client. */
  acquisitionBudgetCents: number;
};

export function planNeeds(s: GrowthSettings, planMonths: number = PLAN_MONTHS): PlanNeeds {
  const residential = ceilDiv(s.residentialTargetCents, s.resVisitPriceCents * s.resVisitsPerMonth);
  const commercial = ceilDiv(s.commercialTargetCents, s.commAccountValueCents);
  const totalClients = residential + commercial;
  const leadsTotal = ceilDiv(totalClients * 10000, s.closeRateBps);
  const weeks = (planMonths * 52) / 12;
  return {
    residential,
    commercial,
    totalClients,
    leadsTotal,
    leadsPerWeek: Math.ceil((leadsTotal / weeks) * 10) / 10,
    acquisitionBudgetCents: totalClients * s.cacCents,
  };
}

export type Milestone = { monthStart: string; targetCents: number; actualCents: number };
export type PlanPhase = "before" | "active" | "after";

export function planPosition(today: string, startDate: string): { phase: PlanPhase; monthIndex: number; daysUntilStart: number } {
  const monthIndex = monthsBetween(monthStartOf(startDate), monthStartOf(today));
  const phase: PlanPhase = monthIndex < 0 ? "before" : monthIndex < PLAN_MONTHS ? "active" : "after";
  return { phase, monthIndex, daysUntilStart: Math.max(0, daysBetween(today, startDate)) };
}

/**
 * The milestone that applies to this New York month. Before the plan starts it
 * is the first one (what month 1 will ask for); after the last month the goal
 * stays at the final milestone.
 */
export function currentMilestone(milestones: Milestone[], monthStart: string): Milestone | null {
  if (milestones.length === 0) return null;
  const sorted = [...milestones].sort((a, b) => a.monthStart.localeCompare(b.monthStart));
  const exact = sorted.find((m) => m.monthStart === monthStart);
  if (exact) return exact;
  return monthStart < sorted[0].monthStart ? sorted[0] : sorted[sorted.length - 1];
}

export type PaceStatus = "ahead" | "on_track" | "behind";
export type Pace = {
  expectedToDateCents: number;
  /** Positive: ahead of a straight line to this month's milestone. One decimal. */
  daysAhead: number;
  status: PaceStatus;
  /** Month-end revenue if the pace so far continues. */
  projectedCents: number;
  remainingCents: number;
  percentOfMilestone: number;
};

/**
 * Straight-line pace inside the month: by day N of D you should have N/D of
 * the milestone. "Days ahead" is the gap divided by a day's share of the goal,
 * so +3 means you are three days of revenue in front.
 */
export function paceForMonth(args: { today: string; monthStart: string; nextMonthStart: string; targetCents: number; revenueCents: number }): Pace {
  const { today, monthStart, nextMonthStart, targetCents, revenueCents } = args;
  const daysInMonth = Math.max(1, daysBetween(monthStart, nextMonthStart));
  const elapsed = Math.min(daysInMonth, Math.max(1, daysBetween(monthStart, today) + 1));
  const expectedToDateCents = Math.round((targetCents * elapsed) / daysInMonth);
  const perDay = targetCents / daysInMonth;
  const daysAhead = perDay > 0 ? round1((revenueCents - expectedToDateCents) / perDay) : 0;
  const status: PaceStatus = targetCents === 0 ? "on_track" : daysAhead >= PACE_BAND_DAYS ? "ahead" : daysAhead <= -PACE_BAND_DAYS ? "behind" : "on_track";
  return {
    expectedToDateCents,
    daysAhead,
    status,
    projectedCents: Math.round((revenueCents * daysInMonth) / elapsed),
    remainingCents: Math.max(0, targetCents - revenueCents),
    percentOfMilestone: targetCents > 0 ? Math.round((revenueCents / targetCents) * 100) : 0,
  };
}

/** The first plan month that already earned the full goal, and how many plan months early that is ("or sooner"). */
export function goalReached(milestones: Milestone[], goalCents: number, today: string): { monthStart: string; monthsEarly: number } | null {
  if (goalCents <= 0) return null;
  const sorted = [...milestones].sort((a, b) => a.monthStart.localeCompare(b.monthStart));
  const idx = sorted.findIndex((m) => m.monthStart <= today && m.actualCents >= goalCents);
  return idx === -1 ? null : { monthStart: sorted[idx].monthStart, monthsEarly: Math.max(0, sorted.length - 1 - idx) };
}

// Ads -------------------------------------------------------------------------

/** What a client is worth per month, weighted by the clients you have (or, with none yet, the clients the plan needs). */
export function avgMonthlyClientValueCents(s: GrowthSettings, residentialActive: number, commercialAccounts: number, needs: PlanNeeds): number {
  const resMonthly = s.resVisitPriceCents * s.resVisitsPerMonth;
  let resW = residentialActive;
  let comW = commercialAccounts;
  if (resW + comW === 0) {
    resW = needs.residential;
    comW = needs.commercial;
  }
  if (resW + comW === 0) return resMonthly;
  return Math.round((resW * resMonthly + comW * s.commAccountValueCents) / (resW + comW));
}

export type BudgetStatus = "under" | "near" | "over";
export type AdMetrics = {
  spend30Cents: number;
  spendMonthCents: number;
  leads30: number;
  booked30: number;
  costPerLeadCents: number | null;
  costPerBookedCents: number | null;
  /** What CAC the payback uses: the real cost per booked client once there are enough bookings, else the assumption. */
  cacCents: number;
  cacSource: "actual" | "assumed";
  avgMonthlyClientValueCents: number;
  /** Months of margin to earn back the cost of winning a client. */
  paybackMonths: number | null;
  budgetCents: number;
  budgetUsedPercent: number;
  budgetStatus: BudgetStatus;
};

export function adMetrics(inputs: GrowthInputs, needs: PlanNeeds): AdMetrics {
  const { settings: s, ads } = inputs;
  const costPerLeadCents = ads.leads30 > 0 ? Math.round(ads.spend30Cents / ads.leads30) : null;
  const costPerBookedCents = ads.booked30 > 0 ? Math.round(ads.spend30Cents / ads.booked30) : null;
  const useActual = ads.booked30 >= MIN_BOOKED_FOR_ACTUAL_CAC && costPerBookedCents !== null;
  const cacCents = useActual ? costPerBookedCents : s.cacCents;
  const value = avgMonthlyClientValueCents(s, inputs.clients.residentialActive, inputs.clients.commercial.accounts, needs);
  const monthlyMargin = (value * s.marginBps) / 10000;
  const budgetUsed = s.monthlyAdBudgetCents > 0 ? ads.spendMonthCents / s.monthlyAdBudgetCents : ads.spendMonthCents > 0 ? Infinity : 0;
  return {
    spend30Cents: ads.spend30Cents,
    spendMonthCents: ads.spendMonthCents,
    leads30: ads.leads30,
    booked30: ads.booked30,
    costPerLeadCents,
    costPerBookedCents,
    cacCents,
    cacSource: useActual ? "actual" : "assumed",
    avgMonthlyClientValueCents: value,
    paybackMonths: monthlyMargin > 0 ? round2(cacCents / monthlyMargin) : null,
    budgetCents: s.monthlyAdBudgetCents,
    budgetUsedPercent: Number.isFinite(budgetUsed) ? Math.round(budgetUsed * 100) : 999,
    budgetStatus: budgetUsed > 1 ? "over" : budgetUsed >= CAPACITY_WARN ? "near" : "under",
  };
}

// Capacity --------------------------------------------------------------------

export type CapacityStatus = "ok" | "warn" | "over";
export type Capacity = {
  neededPerWeek: number;
  capacityPerWeek: number;
  activeCleaners: number;
  /** Needed divided by capacity, as a whole percent. */
  utilizationPercent: number;
  status: CapacityStatus;
  scheduledNext7Days: number;
};

/** Weekly cleans the current clients need (visits a month x 12 / 52) against what active cleaners can cover. */
export function capacity(inputs: GrowthInputs): Capacity {
  const { settings: s, clients, capacity: c } = inputs;
  const monthlyVisits = clients.residentialActive * s.resVisitsPerMonth + clients.commercial.visitsPerMonth;
  const needed = monthlyVisits / WEEKS_PER_MONTH;
  const cap = c.activeCleaners * s.cleansPerCleanerPerWeek;
  const util = cap > 0 ? needed / cap : needed > 0 ? Infinity : 0;
  return {
    neededPerWeek: round1(needed),
    capacityPerWeek: cap,
    activeCleaners: c.activeCleaners,
    utilizationPercent: Number.isFinite(util) ? Math.round(util * 100) : 999,
    status: util > 1 ? "over" : util >= CAPACITY_WARN ? "warn" : "ok",
    scheduledNext7Days: c.scheduledNext7Days,
  };
}

// Cash ------------------------------------------------------------------------

export type CashStatus = "ok" | "low" | "negative";
export type Cash = {
  onHandCents: number;
  bufferCents: number;
  status: CashStatus;
  fixedCostsChargedCents: number;
  collectedCents: number;
  payoutsCents: number;
  adSpendCents: number;
  /** Fixed costs + ads + payouts minus collections over the last 30 days. */
  netBurn30Cents: number;
  /** Months until cash runs out at that burn; null when cash is not shrinking. */
  runwayMonths: number | null;
  /** Cash on hand after the rest of this month's ad budget is spent. */
  afterBudgetCents: number;
};

export function cashPosition(s: GrowthSettings, cash: NonNullable<GrowthInputs["cash"]>, spendMonthCents: number): Cash {
  const fixedCostsChargedCents = cash.fixedMonths * s.monthlyFixedCostsCents;
  const onHandCents = s.startingCapitalCents + cash.collectedCents - cash.payoutsCents - cash.adSpendCents - fixedCostsChargedCents;
  const netBurn30Cents = s.monthlyFixedCostsCents + cash.last30.adSpendCents + cash.last30.payoutsCents - cash.last30.collectedCents;
  const remainingBudget = Math.max(0, s.monthlyAdBudgetCents - spendMonthCents);
  return {
    onHandCents,
    bufferCents: s.minBufferCents,
    status: onHandCents < 0 ? "negative" : onHandCents <= s.minBufferCents ? "low" : "ok",
    fixedCostsChargedCents,
    collectedCents: cash.collectedCents,
    payoutsCents: cash.payoutsCents,
    adSpendCents: cash.adSpendCents,
    netBurn30Cents,
    runwayMonths: netBurn30Cents > 0 ? round1(Math.max(0, onHandCents) / netBurn30Cents) : null,
    afterBudgetCents: onHandCents - remainingBudget,
  };
}

// Scale light -----------------------------------------------------------------

export type ConditionState = "ok" | "warn" | "fail" | "unknown";
export type ConditionKey = "reply" | "capacity" | "payback" | "cash";
export type Condition = { key: ConditionKey; label: string; state: ConditionState; detail: string };
export type ScaleLight = { status: "green" | "amber" | "red"; conditions: Condition[]; blocking: Condition[]; summary: string };

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * Green only when all four hold: replies faster than the target, capacity under
 * 80%, CAC payback under 3 months and cash staying above the buffer once the
 * month's ad budget is spent. Any failing condition makes it red, one that is
 * only close or missing data makes it amber, and each blocker is named.
 */
export function scaleLight(args: { reply: GrowthInputs["reply"]; replyTargetMinutes: number; capacity: Capacity; ads: AdMetrics; cash: Cash }): ScaleLight {
  const { reply, replyTargetMinutes, capacity: cap, ads, cash } = args;
  const conditions: Condition[] = [];

  if (reply.medianMinutes === null || reply.sample === 0) {
    conditions.push({ key: "reply", label: "Lead reply time", state: "unknown", detail: `No replied leads in the last 30 days to measure (target under ${replyTargetMinutes} min)` });
  } else {
    const m = reply.medianMinutes;
    const state: ConditionState = m < replyTargetMinutes ? "ok" : m < replyTargetMinutes * 2 ? "warn" : "fail";
    conditions.push({ key: "reply", label: "Lead reply time", state, detail: `Median reply ${m} min against a target under ${replyTargetMinutes} min` });
  }

  const capState: ConditionState = cap.status === "ok" ? "ok" : cap.status === "warn" ? "warn" : "fail";
  conditions.push({ key: "capacity", label: "Cleaner capacity", state: capState, detail: `${cap.utilizationPercent}% of capacity used; it must stay under ${Math.round(CAPACITY_WARN * 100)}%` });

  if (ads.paybackMonths === null) {
    conditions.push({ key: "payback", label: "CAC payback", state: "unknown", detail: "Payback can't be worked out with a zero margin" });
  } else {
    const p = ads.paybackMonths;
    const state: ConditionState = p < PAYBACK_MAX_MONTHS ? "ok" : p <= PAYBACK_MAX_MONTHS * 1.5 ? "warn" : "fail";
    conditions.push({ key: "payback", label: "CAC payback", state, detail: `${p} months (${ads.cacSource} cost of ${usd(ads.cacCents)} per client); it must be under ${PAYBACK_MAX_MONTHS}` });
  }

  const cashState: ConditionState = cash.onHandCents <= cash.bufferCents ? "fail" : cash.afterBudgetCents > cash.bufferCents ? "ok" : "warn";
  conditions.push({
    key: "cash",
    label: "Cash buffer",
    state: cashState,
    detail:
      cashState === "ok"
        ? `${usd(cash.onHandCents)} on hand stays above the ${usd(cash.bufferCents)} buffer after this month's ad budget`
        : cashState === "warn"
          ? `${usd(cash.onHandCents)} on hand would drop to ${usd(cash.afterBudgetCents)} after this month's ad budget, at or under the ${usd(cash.bufferCents)} buffer`
          : `${usd(cash.onHandCents)} on hand is at or under the ${usd(cash.bufferCents)} buffer`,
  });

  const blocking = conditions.filter((c) => c.state !== "ok");
  const status = conditions.some((c) => c.state === "fail") ? "red" : blocking.length > 0 ? "amber" : "green";
  const summary =
    status === "green"
      ? "Safe to scale spend: replies are fast, there is room to serve more clients, clients pay back quickly and cash stays above the buffer."
      : `${status === "red" ? "Don't scale spend yet" : "Hold spend steady"}: ${blocking.map((c) => c.label.toLowerCase()).join(", ")}.`;
  return { status, conditions, blocking, summary };
}

// The snapshot ----------------------------------------------------------------

export type GrowthSnapshot = {
  generatedAt: string;
  today: string;
  /** True while demo rows (ids starting 5eed0000-) exist, so the numbers are not all real. */
  includesDemo: boolean;
  goal: {
    startDate: string;
    deadline: string;
    monthlyGoalCents: number;
    residentialTargetCents: number;
    commercialTargetCents: number;
    milestones: Milestone[];
    needs: PlanNeeds;
  };
  pace: {
    phase: PlanPhase;
    monthStart: string;
    planMonth: number | null;
    daysUntilStart: number;
    milestoneCents: number;
    revenueCents: number;
    prevMonthRevenueCents: number;
    goalReached: { monthStart: string; monthsEarly: number } | null;
  } & Pace;
  clients: {
    residential: { have: number; need: number };
    commercial: { have: number; need: number };
    wonThisMonth: { residential: number; commercial: number };
  };
  leads: { perWeekActual: number; perWeekNeeded: number; last28: number };
  ads: AdMetrics & {
    campaigns: GrowthInputs["ads"]["campaigns"];
    recentSpend: GrowthInputs["ads"]["recent"];
  };
  capacity: Capacity;
  /** Null when the viewer has no access to payout figures (staff). */
  cash: Cash | null;
  scaleLight: ScaleLight | null;
};

export function buildGrowthSnapshot(inputs: GrowthInputs, now: Date = new Date()): GrowthSnapshot {
  const s = inputs.settings;
  const needs = planNeeds(s);
  const pos = planPosition(inputs.today, s.startDate);
  const milestone = currentMilestone(inputs.milestones, inputs.monthStart);
  const milestoneCents = milestone?.targetCents ?? s.residentialTargetCents + s.commercialTargetCents;
  const goalCents = s.residentialTargetCents + s.commercialTargetCents;
  const pace = paceForMonth({
    today: inputs.today,
    monthStart: inputs.monthStart,
    nextMonthStart: inputs.nextMonthStart,
    targetCents: pos.phase === "before" ? 0 : milestoneCents,
    revenueCents: inputs.revenue.monthCents,
  });
  const ads = adMetrics(inputs, needs);
  const cap = capacity(inputs);
  const cash = inputs.cash ? cashPosition(s, inputs.cash, inputs.ads.spendMonthCents) : null;
  return {
    generatedAt: now.toISOString(),
    today: inputs.today,
    includesDemo: Object.values(inputs.demo).some(Boolean),
    goal: {
      startDate: s.startDate,
      deadline: addMonths(s.startDate, PLAN_MONTHS),
      monthlyGoalCents: goalCents,
      residentialTargetCents: s.residentialTargetCents,
      commercialTargetCents: s.commercialTargetCents,
      milestones: inputs.milestones,
      needs,
    },
    pace: {
      phase: pos.phase,
      monthStart: inputs.monthStart,
      planMonth: pos.phase === "active" ? pos.monthIndex + 1 : null,
      daysUntilStart: pos.daysUntilStart,
      milestoneCents,
      revenueCents: inputs.revenue.monthCents,
      prevMonthRevenueCents: inputs.revenue.prevMonthCents,
      goalReached: goalReached(inputs.milestones, goalCents, inputs.today),
      ...pace,
    },
    clients: {
      residential: { have: inputs.clients.residentialActive, need: needs.residential },
      commercial: { have: inputs.clients.commercial.accounts, need: needs.commercial },
      wonThisMonth: { residential: inputs.leads.wonMonthResidential, commercial: inputs.leads.wonMonthCommercial },
    },
    leads: { perWeekActual: round1(inputs.leads.last28 / 4), perWeekNeeded: needs.leadsPerWeek, last28: inputs.leads.last28 },
    ads: { ...ads, campaigns: inputs.ads.campaigns, recentSpend: inputs.ads.recent },
    capacity: cap,
    cash,
    scaleLight: cash ? scaleLight({ reply: inputs.reply, replyTargetMinutes: s.replyTargetMinutes, capacity: cap, ads, cash }) : null,
  };
}
