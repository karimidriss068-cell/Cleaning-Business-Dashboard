// Growth, part 2: channels and the funnel, reply-time buckets, churn, the
// channel test rules and its recommendation, and the cash-buffer check on a
// planned test. Pure functions; the recommendation only recommends. The same
// buffer rule is enforced in the database (save_channel_test).

import { CHANNELS, PAID_CHANNELS, channelLabel, type Channel, type FunnelRow, type GrowthInputs } from "@/lib/schemas/growth";

/** A channel's cost per lead rising by this much over the last two weeks counts as "rising". */
export const COST_RISE_RATIO = 1.2;
/** Fewer leads than this in either two-week window is too little to call a trend. */
export const TREND_MIN_LEADS = 5;
/** Share of the budget to move to the best channel when another is a loser. */
export const SHIFT_PERCENT = 70;

// Funnel ------------------------------------------------------------------------

export const STAGES = [
  { key: "leads", label: "Leads" },
  { key: "contacted", label: "Contacted" },
  { key: "quoted", label: "Quote sent" },
  { key: "booked", label: "Booked" },
  { key: "firstClean", label: "First clean done" },
  { key: "recurring", label: "Became recurring" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

export type StageCell = {
  key: StageKey;
  label: string;
  count: number;
  /** Share of the previous stage that reached this one, whole percent; null for the first stage or no one before. */
  fromPreviousPercent: number | null;
  /** Share of all leads that reached this stage, whole percent. */
  fromLeadsPercent: number | null;
  /** Spend divided by the people who reached this stage; null with none. */
  costCents: number | null;
};
export type FunnelView = {
  key: string;
  name: string;
  channel: string | null;
  isDemo: boolean;
  spendCents: number;
  stages: StageCell[];
  costPerBookedCents: number | null;
  costPerRecurringCents: number | null;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const per = (spend: number, n: number) => (n > 0 ? Math.round(spend / n) : null);

export function funnelView(row: FunnelRow, name?: string): FunnelView {
  const stages = STAGES.map<StageCell>((st, i) => {
    const count = row[st.key];
    return {
      key: st.key,
      label: st.label,
      count,
      fromPreviousPercent: i === 0 ? null : pct(count, row[STAGES[i - 1].key]),
      fromLeadsPercent: i === 0 ? null : pct(count, row.leads),
      costCents: per(row.spendCents, count),
    };
  });
  return {
    key: row.key,
    name: name ?? row.name ?? row.key,
    channel: row.channel ?? null,
    isDemo: row.isDemo ?? false,
    spendCents: row.spendCents,
    stages,
    costPerBookedCents: per(row.spendCents, row.booked),
    costPerRecurringCents: per(row.spendCents, row.recurring),
  };
}

export function sumFunnel(rows: FunnelRow[]): FunnelRow {
  const total: FunnelRow = { key: "all", leads: 0, contacted: 0, quoted: 0, booked: 0, firstClean: 0, recurring: 0, spendCents: 0 };
  for (const r of rows) {
    total.leads += r.leads;
    total.contacted += r.contacted;
    total.quoted += r.quoted;
    total.booked += r.booked;
    total.firstClean += r.firstClean;
    total.recurring += r.recurring;
    total.spendCents += r.spendCents;
  }
  return total;
}

/** Every channel in a fixed order, with the ones that have no data showing zeros. */
export function channelFunnels(rows: FunnelRow[]): FunnelView[] {
  return CHANNELS.map((c) => {
    const row = rows.find((r) => r.key === c) ?? { key: c, leads: 0, contacted: 0, quoted: 0, booked: 0, firstClean: 0, recurring: 0, spendCents: 0 };
    return funnelView(row, channelLabel[c]);
  });
}

// Reply time --------------------------------------------------------------------

export type ReplyBucketView = { key: "under5" | "under60" | "over60"; label: string; leads: number; booked: number; bookingRatePercent: number | null };
export function replyBuckets(b: GrowthInputs["replyBuckets"]): { buckets: ReplyBucketView[]; unanswered: number } {
  const mk = (key: ReplyBucketView["key"], label: string): ReplyBucketView => ({ key, label, leads: b[key].leads, booked: b[key].booked, bookingRatePercent: pct(b[key].booked, b[key].leads) });
  return { buckets: [mk("under5", "Under 5 minutes"), mk("under60", "5 to 60 minutes"), mk("over60", "Over 1 hour")], unanswered: b.unanswered };
}

// Churn -------------------------------------------------------------------------

export type ChurnMonth = { monthStart: string; startRecurring: number; cancellations: number; rateBps: number | null };
export function churnTracker(rows: GrowthInputs["churn"], assumedBps: number): { months: ChurnMonth[]; averageBps: number | null; assumedBps: number } {
  const months = rows.map((r) => ({ ...r, rateBps: r.startRecurring > 0 ? Math.round((r.cancellations * 10000) / r.startRecurring) : null }));
  const start = rows.reduce((a, r) => a + r.startRecurring, 0);
  const lost = rows.reduce((a, r) => a + r.cancellations, 0);
  return { months, averageBps: start > 0 ? Math.round((lost * 10000) / start) : null, assumedBps };
}

// Channel test ------------------------------------------------------------------

export type TestRules = {
  judgeSpendCents: number;
  judgeLeads: number;
  loserRatioX100: number;
  dailyWeek1Cents: number;
  dailyAfterCents: number;
  windowWeeks: number;
  startDate: string | null;
};
export const testRules = (e: GrowthInputs["settingsExtra"]): TestRules => ({
  judgeSpendCents: e.testJudgeSpendCents,
  judgeLeads: e.testJudgeLeads,
  loserRatioX100: e.testLoserRatioX100,
  dailyWeek1Cents: e.testDailyWeek1Cents,
  dailyAfterCents: e.testDailyAfterCents,
  windowWeeks: e.testWindowWeeks,
  startDate: e.testStartDate,
});

export type ChannelStatus = "not_testing" | "needs_data" | "best" | "ok" | "loser";
export type ChannelTestRow = {
  key: Channel;
  label: string;
  enabled: boolean;
  spendCents: number;
  leads: number;
  booked: number;
  costPerLeadCents: number | null;
  costPerBookedCents: number | null;
  /** Enough spend and leads to judge. */
  judged: boolean;
  needsSpendCents: number;
  needsLeads: number;
  status: ChannelStatus;
  /** This channel's cost per booked client divided by the best channel's; null if either is unknown. */
  ratioToBest: number | null;
  /** Cost per lead over the last 14 days against the 14 before, when both have enough leads. */
  trend: { recentCplCents: number; priorCplCents: number; rising: boolean } | null;
};

export function channelTestRows(test: GrowthInputs["channelTest"], rules: TestRules): ChannelTestRow[] {
  const base = CHANNELS.map((key) => {
    const c = test.channels.find((x) => x.key === key) ?? { key, enabled: false, spendCents: 0, leads: 0, booked: 0, recent: { spendCents: 0, leads: 0 }, prior: { spendCents: 0, leads: 0 } };
    const judged = c.spendCents >= rules.judgeSpendCents && c.leads >= rules.judgeLeads;
    const recentOk = c.recent.leads >= TREND_MIN_LEADS && c.prior.leads >= TREND_MIN_LEADS && c.prior.spendCents > 0;
    const recentCpl = recentOk ? c.recent.spendCents / c.recent.leads : 0;
    const priorCpl = recentOk ? c.prior.spendCents / c.prior.leads : 0;
    return {
      key,
      label: channelLabel[key],
      enabled: c.enabled,
      spendCents: c.spendCents,
      leads: c.leads,
      booked: c.booked,
      costPerLeadCents: per(c.spendCents, c.leads),
      costPerBookedCents: per(c.spendCents, c.booked),
      judged,
      needsSpendCents: Math.max(0, rules.judgeSpendCents - c.spendCents),
      needsLeads: Math.max(0, rules.judgeLeads - c.leads),
      trend: recentOk && recentCpl > 0 && priorCpl > 0 ? { recentCplCents: Math.round(recentCpl), priorCplCents: Math.round(priorCpl), rising: recentCpl >= priorCpl * COST_RISE_RATIO } : null,
    };
  });
  // Only channels with spend are compared; a channel with no spend (referral, organic) has no cost per client.
  const judgedWithBookings = base.filter((c) => c.judged && c.costPerBookedCents !== null && c.spendCents > 0);
  const best = judgedWithBookings.reduce<(typeof base)[number] | null>((a, c) => (a === null || (c.costPerBookedCents ?? Infinity) < (a.costPerBookedCents ?? Infinity) ? c : a), null);
  return base.map<ChannelTestRow>((c) => {
    const paid = c.spendCents > 0;
    let status: ChannelStatus;
    if (!c.enabled && !paid) status = "not_testing";
    else if (!c.judged) status = "needs_data";
    else if (best && c.key === best.key) status = "best";
    else if (best && paid && (c.costPerBookedCents === null || c.costPerBookedCents * 100 >= (best.costPerBookedCents ?? 0) * rules.loserRatioX100)) status = "loser";
    else status = "ok";
    const ratio = best && c.costPerBookedCents !== null && best.costPerBookedCents ? Math.round((c.costPerBookedCents / best.costPerBookedCents) * 100) / 100 : null;
    return { ...c, status, ratioToBest: ratio };
  });
}

export type Recommendation = {
  state: "keep_testing" | "shift" | "scale_add";
  headline: string;
  detail: string;
  best: Channel | null;
  shutDown: Channel[];
  shiftPercent: number | null;
};

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * What the numbers suggest, in order: nothing judged yet means keep testing and
 * say what each channel still needs; a winner whose cost per lead is rising
 * means keep scaling it and add another channel; a winner with a loser means
 * shift 70% of the budget to it and shut the loser down; anything else is keep
 * testing. It only recommends: nothing here changes a budget.
 */
export function recommend(rows: ChannelTestRow[], rules: TestRules, today: string): Recommendation {
  const paid = rows.filter((r) => PAID_CHANNELS.includes(r.key as (typeof PAID_CHANNELS)[number]) && (r.enabled || r.spendCents > 0));
  const judged = paid.filter((r) => r.judged);
  const best = rows.find((r) => r.status === "best") ?? null;
  const losers = rows.filter((r) => r.status === "loser");
  const windowEnded = rules.startDate !== null && today > addDaysIso(rules.startDate, rules.windowWeeks * 7);
  const endNote = windowEnded ? " The test window has ended, so log your decision." : "";
  if (judged.length === 0 || !best) {
    const next = [...paid].sort((a, b) => a.needsSpendCents + a.needsLeads * 100 - (b.needsSpendCents + b.needsLeads * 100))[0];
    const left = next ? `${next.label} still needs ${usd(next.needsSpendCents)} more spend and ${next.needsLeads} more leads to be judged.` : "No channel is in the test yet.";
    return {
      state: "keep_testing",
      headline: "Keep testing",
      detail: judged.length > 0 ? `${judged.length} channel${judged.length === 1 ? " is" : "s are"} judged but none has a booked client yet. Keep going.${endNote}` : `${left}${endNote}`,
      best: null,
      shutDown: [],
      shiftPercent: null,
    };
  }
  if (best.trend?.rising) {
    return {
      state: "scale_add",
      headline: `Keep scaling ${best.label} and add another channel`,
      detail: `${best.label} is the cheapest per booked client (${usd(best.costPerBookedCents ?? 0)}), but its cost per lead rose from ${usd(best.trend.priorCplCents)} to ${usd(best.trend.recentCplCents)} over two weeks. Test another channel before it gets worse.${endNote}`,
      best: best.key,
      shutDown: losers.map((l) => l.key),
      shiftPercent: null,
    };
  }
  if (losers.length > 0) {
    const names = losers.map((l) => l.label).join(" and ");
    return {
      state: "shift",
      headline: `Shift ${SHIFT_PERCENT}% to ${best.label}, shut down ${names}`,
      detail: `${best.label} books clients at ${usd(best.costPerBookedCents ?? 0)} each. ${losers
        .map((l) => (l.costPerBookedCents === null ? `${l.label} has spent ${usd(l.spendCents)} with no booked client` : `${l.label} costs ${usd(l.costPerBookedCents)} (${l.ratioToBest}x)`))
        .join("; ")}.${endNote}`,
      best: best.key,
      shutDown: losers.map((l) => l.key),
      shiftPercent: SHIFT_PERCENT,
    };
  }
  return {
    state: "keep_testing",
    headline: "Keep testing",
    detail: `${best.label} is cheapest per booked client (${usd(best.costPerBookedCents ?? 0)}), but no judged channel is ${(rules.loserRatioX100 / 100).toFixed(1)}x worse yet, so nothing is a clear loser.${endNote}`,
    best: best.key,
    shutDown: [],
    shiftPercent: null,
  };
}

export function addDaysIso(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Budget and the cash buffer ----------------------------------------------------

/** Week 1 at the first daily budget, then the second, for each channel in the test. */
export function plannedTestSpendCents(rules: TestRules, channelCount: number): number {
  return channelCount * 7 * (rules.dailyWeek1Cents + (rules.windowWeeks - 1) * rules.dailyAfterCents);
}

/** What the daily budget per channel is today: the week-1 budget for the first seven days, then the second. */
export function dailyBudgetToday(rules: TestRules, today: string): { cents: number; phase: "not_started" | "week1" | "after" | "ended" } {
  if (rules.startDate === null || today < rules.startDate) return { cents: rules.dailyWeek1Cents, phase: "not_started" };
  const day = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${rules.startDate}T00:00:00Z`)) / 86_400_000);
  if (day >= rules.windowWeeks * 7) return { cents: 0, phase: "ended" };
  return day < 7 ? { cents: rules.dailyWeek1Cents, phase: "week1" } : { cents: rules.dailyAfterCents, phase: "after" };
}

export type BudgetCheck = { plannedCents: number; spentCents: number; remainingCents: number; roomCents: number; ok: boolean; message: string | null };

/**
 * The test's remaining planned spend (planned minus what the enabled channels
 * already spent since the start) must fit in the cash above the buffer. Spend
 * already made is out of cash on hand, so only the rest is checked.
 */
export function testBudgetCheck(args: { rules: TestRules; enabledCount: number; spentSinceStartCents: number; cashOnHandCents: number; bufferCents: number }): BudgetCheck {
  const plannedCents = plannedTestSpendCents(args.rules, args.enabledCount);
  const spentCents = args.rules.startDate === null ? 0 : args.spentSinceStartCents;
  const remainingCents = Math.max(0, plannedCents - spentCents);
  const roomCents = args.cashOnHandCents - args.bufferCents;
  const ok = remainingCents <= Math.max(0, roomCents);
  return {
    plannedCents,
    spentCents,
    remainingCents,
    roomCents,
    ok,
    message: ok ? null : `The test would spend ${usd(remainingCents)} more, but only ${usd(Math.max(0, roomCents))} of cash is above the ${usd(args.bufferCents)} buffer.`,
  };
}
