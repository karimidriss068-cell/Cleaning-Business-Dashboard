import { describe, expect, it } from "vitest";
import { buildGrowthSnapshot } from "@/lib/growth-snapshot";
import { EXTENDED, SETTINGS } from "@/lib/growth-fixture";
import { growthInputsSchema, type GrowthInputs } from "@/lib/schemas/growth";

const inputs = (over: Partial<GrowthInputs> = {}): GrowthInputs => ({
  today: "2026-12-16",
  monthStart: "2026-12-01",
  nextMonthStart: "2027-01-01",
  settings: SETTINGS,
  milestones: [{ monthStart: "2026-12-01", targetCents: 100000, actualCents: 50000 }],
  revenue: { monthCents: 50000, prevMonthCents: 300000 },
  clients: { residentialActive: 10, commercial: { accounts: 2, visitsPerMonth: 8, monthlyValueCents: 120000 } },
  leads: { last28: 28, wonMonthResidential: 1, wonMonthCommercial: 0 },
  ads: { spend30Cents: 60000, spendMonthCents: 30000, leads30: 20, booked30: 4, campaigns: [], recent: [] },
  reply: { medianMinutes: 3, sample: 12 },
  capacity: { activeCleaners: 3, scheduledNext7Days: 9 },
  cash: { collectedCents: 300000, payoutsCents: 100000, adSpendCents: 30000, fixedMonths: 0, last30: { collectedCents: 300000, payoutsCents: 100000, adSpendCents: 60000 } },
  demo: { adSpend: false, leads: false, jobs: false, invoices: false, payments: false },
  ...EXTENDED,
  ...over,
});

describe("growth snapshot", () => {
  const s = buildGrowthSnapshot(inputs(), new Date("2026-12-16T15:00:00Z"));
  it("keeps part 1 and adds the north star", () => {
    expect(s.goal.monthlyGoalCents).toBe(1000000);
    expect(s.scaleLight?.status).toBeDefined();
    expect(s.tiers.selected).toBe("base");
    expect(s.tiers.paces).toHaveLength(3);
    expect(s.forecast.map((f) => f.tier)).toEqual(["base", "strong", "north_star"]);
    expect(s.gates).toHaveLength(5);
    expect(s.funnel.channels).toHaveLength(6);
    expect(s.funnel.windowDays).toBe(90);
    expect(s.channelTest.recommendation.state).toBeDefined();
  });
  it("works out profit for owner/admin from the months", () => {
    expect(s.profit?.thisMonth).toMatchObject({ monthStart: "2026-12-01", netProfitCents: -10000 }); // 50,000 - 20,000 - 30,000 - 10,000
    expect(s.tiers.paces[2].actualCents).toBe(-10000);
  });
  it("checks the test budget against cash above the buffer", () => {
    expect(s.channelTest.budget).toMatchObject({ plannedCents: 231000, ok: true });
    const poor = buildGrowthSnapshot(inputs({ cashOnHandCents: 150000 }));
    expect(poor.channelTest.budget?.ok).toBe(false);
  });
  it("hides profit, cash and the budget check from staff", () => {
    const staff = buildGrowthSnapshot(
      inputs({ cash: null, cashOnHandCents: null, expenses: null, months: EXTENDED.months.map((m) => ({ ...m, subPayCents: null, otherCostsCents: null })) }),
    );
    expect(staff.profit).toBeNull();
    expect(staff.cash).toBeNull();
    expect(staff.scaleLight).toBeNull();
    expect(staff.channelTest.budget).toBeNull();
    expect(staff.tiers.paces[2].pace).toBeNull();
    expect(staff.tiers.paces[0].pace).not.toBeNull(); // revenue is visible
  });
  it("is plain JSON of integer cents", () => {
    const back = JSON.parse(JSON.stringify(s));
    expect(Number.isInteger(back.forecast[0].adBudgetMonthlyCents)).toBe(true);
    expect(growthInputsSchema.safeParse(inputs()).success).toBe(true);
  });
});
