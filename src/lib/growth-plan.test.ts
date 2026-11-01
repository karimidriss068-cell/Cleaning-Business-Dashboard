import { describe, expect, it } from "vitest";
import { evaluateGates, forecastTier, gateDueOn, hireTriggers, planMonthOf, profitMonth, rampShares, tierPaces, crewsHave } from "@/lib/growth-plan";
import { EXTENDED, GATE_CRITERIA, SETTINGS } from "@/lib/growth-fixture";
import { growthInputsSchema, type GrowthInputs } from "@/lib/schemas/growth";

function inputs(over: Partial<GrowthInputs> = {}): GrowthInputs {
  return {
    today: "2026-12-16",
    monthStart: "2026-12-01",
    nextMonthStart: "2027-01-01",
    settings: SETTINGS,
    milestones: [],
    revenue: { monthCents: 50000, prevMonthCents: 0 },
    clients: { residentialActive: 10, commercial: { accounts: 2, visitsPerMonth: 8, monthlyValueCents: 120000 } },
    leads: { last28: 28, wonMonthResidential: 1, wonMonthCommercial: 0 },
    ads: { spend30Cents: 60000, spendMonthCents: 30000, leads30: 20, booked30: 4, campaigns: [], recent: [] },
    reply: { medianMinutes: 3, sample: 12 },
    capacity: { activeCleaners: 3, scheduledNext7Days: 9 },
    cash: { collectedCents: 300000, payoutsCents: 100000, adSpendCents: 30000, fixedMonths: 0, last30: { collectedCents: 300000, payoutsCents: 100000, adSpendCents: 60000 } },
    demo: { adSpend: false, leads: false, jobs: false, invoices: false, payments: false },
    ...EXTENDED,
    ...over,
  };
}

describe("profit", () => {
  it("is revenue minus cleaner pay, ads and other costs, with a margin in basis points", () => {
    const p = profitMonth({ monthStart: "2027-01-01", revenueCents: 1000000, subPayCents: 450000, adSpendCents: 150000, otherCostsCents: 100000 });
    expect(p.netProfitCents).toBe(300000);
    expect(p.marginBps).toBe(3000);
  });
  it("can be a loss", () => {
    const p = profitMonth({ monthStart: "2027-01-01", revenueCents: 100000, subPayCents: 60000, adSpendCents: 50000, otherCostsCents: 10000 });
    expect(p.netProfitCents).toBe(-20000);
    expect(p.marginBps).toBe(-2000);
  });
  it("has no margin without revenue, and no profit when the viewer can't see costs", () => {
    expect(profitMonth({ monthStart: "2027-01-01", revenueCents: 0, subPayCents: 0, adSpendCents: 1000, otherCostsCents: 0 }).marginBps).toBeNull();
    const hidden = profitMonth({ monthStart: "2027-01-01", revenueCents: 500000, subPayCents: null, adSpendCents: 1000, otherCostsCents: null });
    expect(hidden.netProfitCents).toBeNull();
    expect(hidden.marginBps).toBeNull();
  });
  it("rounds the margin to a whole basis point", () => {
    expect(profitMonth({ monthStart: "2027-01-01", revenueCents: 300000, subPayCents: 100000, adSpendCents: 0, otherCostsCents: 0 }).marginBps).toBe(6667);
  });
});

describe("tiers", () => {
  it("places the plan month 0 before the start, 1 to 12 during it, and 12 after", () => {
    expect(planMonthOf("2026-11-30", "2026-12-01")).toBe(0);
    expect(planMonthOf("2026-12-01", "2026-12-01")).toBe(1);
    expect(planMonthOf("2027-02-10", "2026-12-01")).toBe(3);
    expect(planMonthOf("2027-11-30", "2026-12-01")).toBe(12);
    expect(planMonthOf("2028-03-01", "2026-12-01")).toBe(12);
  });
  it("ramps through the revenue the gates ask for at months 3, 6 and 9", () => {
    const r = rampShares(GATE_CRITERIA, 5000000);
    expect(r).toHaveLength(13);
    expect(r[0]).toBe(0);
    expect(r[3]).toBeCloseTo(0.08, 10);
    expect(r[6]).toBeCloseTo(0.2, 10);
    expect(r[9]).toBeCloseTo(0.6, 10);
    expect(r[12]).toBe(1);
    expect(r[1]).toBeCloseTo(0.08 / 3, 10);
    expect(r[7]).toBeCloseTo(0.2 + 0.4 / 3, 10);
  });
  it("follows an edited gate, and ignores a disabled one", () => {
    const edited = GATE_CRITERIA.map((g) => (g.checkpoint === "month6" && g.metric === "month_revenue_cents" ? { ...g, threshold: 1500000 } : g));
    expect(rampShares(edited, 5000000)[6]).toBeCloseTo(0.3, 10);
    const off = GATE_CRITERIA.map((g) => (g.checkpoint === "month6" && g.metric === "month_revenue_cents" ? { ...g, enabled: false } : g));
    expect(rampShares(off, 5000000)[6]).toBeCloseTo(0.08 + (0.6 - 0.08) / 2, 10); // straight between month 3 and month 9
  });
  const args = { extra: EXTENDED.settingsExtra, gates: GATE_CRITERIA, startDate: "2026-12-01", today: "2027-02-14", monthStart: "2027-02-01", nextMonthStart: "2027-03-01" };
  it("scales the ramp to each tier and keeps the others visible", () => {
    const t = tierPaces({ ...args, revenueCents: 200000, profitCents: 100000 });
    expect(t.map((x) => x.tier)).toEqual(["base", "strong", "north_star"]);
    expect(t.map((x) => x.selected)).toEqual([true, false, false]);
    expect(t.map((x) => x.monthTargetCents)).toEqual([400000, 800000, 400000]); // month 3 = 8% of 50k, 100k and 50k
    expect(t[1].fullTargetCents).toBe(10000000);
  });
  it("measures base and strong by revenue and the north star by profit", () => {
    const t = tierPaces({ ...args, revenueCents: 200000, profitCents: 100000 });
    expect(t[0].actualCents).toBe(200000);
    expect(t[2].actualCents).toBe(100000);
    expect(t[2].metric).toBe("profit");
    expect(t[0].percentOfFull).toBe(4); // $2,000 of $50,000
  });
  it("reports pace against each tier's target", () => {
    // Day 14 of 28: half of month 3's target is due by now.
    const t = tierPaces({ ...args, revenueCents: 200000, profitCents: 200000 });
    expect(t[0].pace?.expectedToDateCents).toBe(200000);
    expect(t[0].pace?.status).toBe("on_track");
    expect(t[1].pace?.status).toBe("behind"); // strong wants 400,000 by now
    expect(t[2].pace?.status).toBe("on_track");
  });
  it("has no profit pace for staff, and no target before the start", () => {
    expect(tierPaces({ ...args, revenueCents: 1, profitCents: null })[2].pace).toBeNull();
    const before = tierPaces({ ...args, today: "2026-11-10", monthStart: "2026-11-01", nextMonthStart: "2026-12-01", revenueCents: 5, profitCents: 5 });
    expect(before.every((x) => x.monthTargetCents === 0)).toBe(true);
  });
  it("tracks the selected tier", () => {
    expect(tierPaces({ ...args, extra: { ...args.extra, tier: "north_star" }, revenueCents: 1, profitCents: 1 }).map((x) => x.selected)).toEqual([false, false, true]);
  });
});

describe("forecast", () => {
  const i = inputs();
  it("works out the base tier from the assumptions", () => {
    const f = forecastTier("base", i, 1, 12);
    expect(f.revenueCents).toBe(5000000);
    expect(f.residentialClients).toBe(89); // 64% of $50k = $32,000 at $360 a client
    expect(f.commercialAccounts).toBe(30); // 36% of $50k = $18,000 at $600 an account
    expect(f.clients).toBe(119);
    expect(f.cleansPerWeek).toBe(68.8); // (89 x 2 + 30 x 4) / 4.33
    expect(f.crews).toBe(3); // at 25 cleans a crew a week
    expect(f.winsNeeded).toBe(155); // 119 + 5% a month of half the base for 12 months
    expect(f.leadsPerWeek).toBe(15); // 775 leads over 52 weeks is 14.9, rounded up to a tenth: 15
    expect(f.adBudgetMonthlyCents).toBe(322917); // 155 clients at $250 over 12 months
    expect(f.clientsToAdd).toBe(107);
    expect(f.crewsToAdd).toBe(2);
  });
  it("doubles the strong tier", () => {
    const f = forecastTier("strong", i, 1, 12);
    expect(f.revenueCents).toBe(10000000);
    expect(f.clients).toBeGreaterThan(forecastTier("base", i, 1, 12).clients * 1.9);
  });
  it("turns the profit target into revenue with the margin assumption", () => {
    const f = forecastTier("north_star", i, 1, 12);
    expect(f.revenueCents).toBe(12500000); // $50k profit at 40% margin
    expect(f.crews).toBeGreaterThan(forecastTier("strong", i, 1, 12).crews);
  });
  it("changes with churn and cleans per crew", () => {
    const noChurn = forecastTier("base", inputs({ settingsExtra: { ...EXTENDED.settingsExtra, monthlyChurnBps: 0 } }), 1, 12);
    expect(noChurn.winsNeeded).toBe(noChurn.clients);
    const bigCrews = forecastTier("base", inputs({ settingsExtra: { ...EXTENDED.settingsExtra, cleansPerCrewPerWeek: 70 } }), 1, 12);
    expect(bigCrews.crews).toBe(1);
  });
  it("never asks for negative additions", () => {
    const f = forecastTier("base", i, 99, 999);
    expect(f.clientsToAdd).toBe(0);
    expect(f.crewsToAdd).toBe(0);
  });
  it("counts crews you have, or half the cleaners when none are set up", () => {
    expect(crewsHave(2, 9)).toBe(2);
    expect(crewsHave(0, 5)).toBe(3);
    expect(crewsHave(0, 0)).toBe(0);
  });
});

describe("gates", () => {
  it("is due 30 days after the start, and after the end of plan month 3, 6, 9 and 12", () => {
    expect(gateDueOn("2026-12-01", "day30")).toBe("2026-12-31");
    expect(gateDueOn("2026-12-15", "day30")).toBe("2027-01-14");
    expect(gateDueOn("2026-12-01", "month3")).toBe("2027-03-01");
    expect(gateDueOn("2026-12-01", "month12")).toBe("2027-12-01");
    expect(gateDueOn("2026-12-15", "month3")).toBe("2027-03-01");
  });
  const day30 = (over: Partial<GrowthInputs>, judged = 1) => evaluateGates(inputs(over), judged, null)[0];
  it("passes day 30 when the test is done, replies are fast and three clients are booked", () => {
    const g = day30({ today: "2026-12-31" });
    expect(g.status).toBe("passed");
    expect(g.criteria.map((c) => c.state)).toEqual(["met", "met", "met"]);
  });
  it("passes early once everything is met", () => {
    expect(day30({ today: "2026-12-10" }).status).toBe("passed");
  });
  it("is on track while it isn't due and something isn't met yet", () => {
    const g = day30({ today: "2026-12-30", reply: { medianMinutes: 7, sample: 4 } });
    expect(g.status).toBe("on_track");
    expect(g.criteria[1].state).toBe("pending");
  });
  it("is missed on the due day when something isn't met", () => {
    const g = day30({ today: "2026-12-31", reply: { medianMinutes: 5, sample: 4 } }); // exactly 5 is not under 5
    expect(g.status).toBe("missed");
    expect(day30({ today: "2026-12-31", wonSincePlanStart: 2 }).status).toBe("missed");
    expect(day30({ today: "2026-12-31" }, 0).status).toBe("missed");
  });
  it("has no reply time to judge without replied leads", () => {
    const g = day30({ today: "2026-12-31", reply: { medianMinutes: null, sample: 0 } });
    expect(g.criteria[1].value).toBeNull();
    expect(g.status).toBe("missed");
  });
  const month3 = (over: Partial<GrowthInputs>) => evaluateGates(inputs({ today: "2027-03-01", monthStart: "2027-03-01", nextMonthStart: "2027-04-01", ...over }), 1, null)[1];
  const months = [{ monthStart: "2027-02-01", revenueCents: 450000, adSpendCents: 0, subPayCents: 0, otherCostsCents: 0 }];
  it("judges month 3 on that month's revenue, the real cost to win a client and payback", () => {
    const ok = month3({ months, ads: { ...inputs().ads, booked30: 4, spend30Cents: 100000 } }); // $250 a client, payback 1.6 months
    expect(ok.status).toBe("passed");
    const dear = month3({ months, ads: { ...inputs().ads, booked30: 4, spend30Cents: 130000 } }); // $325 a client
    expect(dear.status).toBe("missed");
    expect(dear.criteria.find((c) => c.metric === "cost_to_win_cents")?.state).toBe("missed");
    const edge = month3({ months, ads: { ...inputs().ads, booked30: 4, spend30Cents: 120000 } }); // exactly $300 is at or under
    expect(edge.criteria.find((c) => c.metric === "cost_to_win_cents")?.state).toBe("met");
  });
  it("won't use an assumed cost to win a client as if it were real", () => {
    const g = month3({ months, ads: { ...inputs().ads, booked30: 2 } });
    expect(g.criteria.find((c) => c.metric === "cost_to_win_cents")?.value).toBeNull();
    expect(g.status).toBe("missed");
  });
  it("requires payback under 3 months (3.0 is not under)", () => {
    const g = month3({ months, ads: { ...inputs().ads, booked30: 4, spend30Cents: 109200 } }); // $273 a client vs $160 a month = 1.7; below
    expect(g.criteria.find((c) => c.metric === "payback_tenths")?.state).toBe("met");
  });
  it("uses revenue-based gates for month 6 and 9 and hides margin from staff", () => {
    const m6 = [{ monthStart: "2027-05-01", revenueCents: 1000000, adSpendCents: 0, subPayCents: null, otherCostsCents: null }];
    const g = evaluateGates(inputs({ today: "2027-06-01", months: m6 }), 1, null)[2];
    expect(g.criteria.find((c) => c.metric === "margin_bps")?.hidden).toBe(true);
    expect(g.status).toBe("passed"); // revenue is met; the hidden margin can't fail it for staff
  });
  it("judges the month 6 margin from net profit for owner/admin", () => {
    const months6 = [{ monthStart: "2027-05-01", revenueCents: 1000000, adSpendCents: 100000, subPayCents: 400000, otherCostsCents: 100000 }];
    const base = inputs({ today: "2027-06-01", months: months6 });
    const profit = base.months.map(profitMonth);
    const g = evaluateGates(base, 1, profit)[2];
    expect(g.criteria.find((c) => c.metric === "margin_bps")?.value).toBe(4000);
    expect(g.status).toBe("passed");
    const thin = evaluateGates(inputs({ today: "2027-06-01", months: [{ ...months6[0], subPayCents: 600000 }] }), 1, [profitMonth({ ...months6[0], subPayCents: 600000 })])[2];
    expect(thin.status).toBe("missed"); // 20% margin is under 30%
  });
  it("passes month 12 at the base tier, which follows the tier setting", () => {
    const m12 = [{ monthStart: "2027-11-01", revenueCents: 5000000, adSpendCents: 0, subPayCents: 0, otherCostsCents: 0 }];
    expect(evaluateGates(inputs({ today: "2027-12-01", months: m12 }), 1, null)[4].status).toBe("passed");
    const higher = inputs({ today: "2027-12-01", months: m12, settingsExtra: { ...EXTENDED.settingsExtra, tierBaseRevenueCents: 6000000 } });
    expect(evaluateGates(higher, 1, null)[4].status).toBe("missed");
  });
  it("ignores a disabled criterion", () => {
    const off = GATE_CRITERIA.map((g) => (g.checkpoint === "day30" && g.metric === "clients_booked" ? { ...g, enabled: false } : g));
    expect(evaluateGates(inputs({ today: "2026-12-31", gateCriteria: off, wonSincePlanStart: 0 }), 1, null)[0].status).toBe("passed");
  });
  it("has all five checkpoints", () => {
    expect(evaluateGates(inputs(), 0, null).map((g) => g.checkpoint)).toEqual(["day30", "month3", "month6", "month9", "month12"]);
  });
});

describe("hire triggers", () => {
  it("lights up at the threshold you set", () => {
    const at = (over: Partial<GrowthInputs>, crews = 1) => hireTriggers(inputs(over), crews);
    const clients = (n: number) => at({ clients: { residentialActive: n, commercial: { accounts: 0, visitsPerMonth: 0, monthlyValueCents: 0 } } }).find((t) => t.key === "clients");
    expect(clients(29)?.lit).toBe(false);
    expect(clients(30)?.lit).toBe(true);
    expect(at({ leads: { ...inputs().leads, last28: 60 } }).find((t) => t.key === "leads_per_week")?.lit).toBe(true); // 15 a week
    expect(at({ leads: { ...inputs().leads, last28: 59 } }).find((t) => t.key === "leads_per_week")?.lit).toBe(false);
  });
  it("lights up when you are a crew short, and not when disabled", () => {
    // 10 residential x 2 + 8 commercial = 28 visits a month = 6.5 cleans a week: one crew of 25 is plenty
    expect(hireTriggers(inputs(), 1).find((t) => t.key === "crews_short")?.lit).toBe(false);
    const busy = inputs({ clients: { residentialActive: 60, commercial: { accounts: 10, visitsPerMonth: 40, monthlyValueCents: 600000 } } }); // 160 visits a month = 37 a week
    expect(hireTriggers(busy, 1).find((t) => t.key === "crews_short")).toMatchObject({ value: 1, lit: true });
    expect(hireTriggers(busy, 2).find((t) => t.key === "crews_short")?.lit).toBe(false);
    const off = inputs({ ...busy, hireTriggers: EXTENDED.hireTriggers.map((t) => ({ ...t, enabled: false })) });
    expect(hireTriggers(off, 1).every((t) => !t.lit)).toBe(true);
  });
});

describe("the database answer", () => {
  it("parses with the new keys", () => {
    expect(growthInputsSchema.safeParse(JSON.parse(JSON.stringify(inputs()))).success).toBe(true);
    expect(growthInputsSchema.safeParse({ ...inputs(), funnel: undefined }).success).toBe(false);
  });
});
