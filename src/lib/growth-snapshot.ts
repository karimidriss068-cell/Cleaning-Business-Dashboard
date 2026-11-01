// The whole growth snapshot: part 1 (goal, pace, ads, capacity, cash, scale
// light) plus the 12-month north star (tiers, profit, forecast, gates, hire
// triggers, decisions, funnel, reply time, churn and the channel test). One
// builder feeds the page, the Command Center card and the read-only bot endpoint.

import { buildCoreSnapshot, type CoreSnapshot } from "@/lib/growth";
import {
  crewsHave,
  evaluateGates,
  forecastTier,
  hireTriggers,
  planMonthOf,
  profitMonth,
  rampShares,
  tierPaces,
  type Forecast,
  type GateResult,
  type HireTrigger,
  type ProfitMonth,
  type TierPace,
} from "@/lib/growth-plan";
import {
  channelFunnels,
  channelTestRows,
  churnTracker,
  dailyBudgetToday,
  funnelView,
  recommend,
  replyBuckets,
  sumFunnel,
  testBudgetCheck,
  testRules,
  addDaysIso,
  type BudgetCheck,
  type ChannelTestRow,
  type ChurnMonth,
  type FunnelView,
  type Recommendation,
  type ReplyBucketView,
  type TestRules,
} from "@/lib/growth-channels";
import { PAID_CHANNELS, type GrowthInputs, type TierKey } from "@/lib/schemas/growth";

export type GrowthSnapshot = CoreSnapshot & {
  tiers: { selected: TierKey; planMonth: number; paces: TierPace[]; ramp: number[] };
  /** Null for staff: profit includes what the cleaners are paid. */
  profit: {
    months: ProfitMonth[];
    thisMonth: ProfitMonth | null;
    expenses: NonNullable<GrowthInputs["expenses"]>;
  } | null;
  forecast: Forecast[];
  gates: GateResult[];
  hireTriggers: HireTrigger[];
  decisions: GrowthInputs["decisions"];
  funnel: {
    windowDays: number;
    total: FunnelView;
    channels: FunnelView[];
    campaigns: FunnelView[];
    creatives: FunnelView[];
  };
  replyBuckets: { buckets: ReplyBucketView[]; unanswered: number };
  churn: { months: ChurnMonth[]; averageBps: number | null; assumedBps: number };
  channelTest: {
    rules: TestRules;
    rows: ChannelTestRow[];
    recommendation: Recommendation;
    dailyBudget: { cents: number; phase: "not_started" | "week1" | "after" | "ended" };
    windowEndsOn: string | null;
    enabledChannels: string[];
    /** Null for staff (needs cash on hand). */
    budget: BudgetCheck | null;
  };
};

export const FUNNEL_WINDOW_DAYS = 90;

export function buildGrowthSnapshot(inputs: GrowthInputs, now: Date = new Date()): GrowthSnapshot {
  const core = buildCoreSnapshot(inputs, now);
  const e = inputs.settingsExtra;
  const haveCrews = crewsHave(inputs.activeCrews, inputs.capacity.activeCleaners);
  const clientsHave = inputs.clients.residentialActive + inputs.clients.commercial.accounts;

  const profitMonths = inputs.cash === null && inputs.months.every((m) => m.subPayCents === null) ? null : inputs.months.map(profitMonth);
  const thisMonthProfit = profitMonths?.find((m) => m.monthStart === inputs.monthStart) ?? null;

  const rules = testRules(e);
  const rows = channelTestRows(inputs.channelTest, rules);
  const channelsJudged = rows.filter((r) => r.judged).length;
  const enabled = rows.filter((r) => r.enabled && (PAID_CHANNELS as readonly string[]).includes(r.key));
  const budget =
    inputs.cashOnHandCents === null
      ? null
      : testBudgetCheck({
          rules,
          enabledCount: enabled.length,
          spentSinceStartCents: enabled.reduce((a, r) => a + r.spendCents, 0),
          cashOnHandCents: inputs.cashOnHandCents,
          bufferCents: inputs.settings.minBufferCents,
        });

  return {
    ...core,
    tiers: {
      selected: e.tier,
      planMonth: planMonthOf(inputs.today, inputs.settings.startDate),
      ramp: rampShares(inputs.gateCriteria, e.tierBaseRevenueCents),
      paces: tierPaces({
        extra: e,
        gates: inputs.gateCriteria,
        startDate: inputs.settings.startDate,
        today: inputs.today,
        monthStart: inputs.monthStart,
        nextMonthStart: inputs.nextMonthStart,
        revenueCents: inputs.revenue.monthCents,
        profitCents: thisMonthProfit?.netProfitCents ?? null,
      }),
    },
    profit: profitMonths ? { months: profitMonths, thisMonth: thisMonthProfit, expenses: inputs.expenses ?? [] } : null,
    forecast: (["base", "strong", "north_star"] as const).map((t) => forecastTier(t, inputs, haveCrews, clientsHave)),
    gates: evaluateGates(inputs, channelsJudged, profitMonths),
    hireTriggers: hireTriggers(inputs, haveCrews),
    decisions: inputs.decisions,
    funnel: {
      windowDays: FUNNEL_WINDOW_DAYS,
      total: funnelView(sumFunnel(inputs.funnel.channels), "All channels"),
      channels: channelFunnels(inputs.funnel.channels),
      campaigns: inputs.funnel.campaigns.map((r) => funnelView(r)),
      creatives: inputs.funnel.creatives.map((r) => funnelView(r, r.key)),
    },
    replyBuckets: replyBuckets(inputs.replyBuckets),
    churn: churnTracker(inputs.churn, e.monthlyChurnBps),
    channelTest: {
      rules,
      rows,
      recommendation: recommend(rows, rules, inputs.today),
      dailyBudget: dailyBudgetToday(rules, inputs.today),
      windowEndsOn: rules.startDate ? addDaysIso(rules.startDate, rules.windowWeeks * 7) : null,
      enabledChannels: enabled.map((r) => r.key),
      budget,
    },
  };
}
