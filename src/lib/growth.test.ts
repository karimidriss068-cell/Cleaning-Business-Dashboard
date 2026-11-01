import { describe, expect, it } from "vitest";
import {
  PACE_BAND_DAYS,
  addMonths,
  adMetrics,
  avgMonthlyClientValueCents,
  buildCoreSnapshot,
  capacity,
  cashPosition,
  currentMilestone,
  daysBetween,
  goalReached,
  monthsBetween,
  paceForMonth,
  percentToBps,
  planNeeds,
  planPosition,
  scaleLight,
  type Milestone,
} from "@/lib/growth";
import { growthInputsSchema, planSchema, type GrowthInputs } from "@/lib/schemas/growth";
import { EXTENDED } from "@/lib/growth-fixture";

const settings: GrowthInputs["settings"] = {
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
const MILESTONES: Milestone[] = [100000, 250000, 400000, 600000, 800000, 1000000].map((t, i) => ({ monthStart: `2026-${String(12 + i > 12 ? 12 + i - 12 : 12 + i).padStart(2, "0")}-01`.replace(/^2026-0([1-5])/, "2027-0$1"), targetCents: t, actualCents: 0 }));

function inputs(over: Partial<GrowthInputs> = {}): GrowthInputs {
  return {
    today: "2026-12-16",
    monthStart: "2026-12-01",
    nextMonthStart: "2027-01-01",
    settings,
    milestones: MILESTONES,
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

describe("dates", () => {
  it("counts days and months across month and year ends", () => {
    expect(daysBetween("2026-12-01", "2027-01-01")).toBe(31);
    expect(monthsBetween("2026-12-01", "2027-05-01")).toBe(5);
    expect(monthsBetween("2027-01-01", "2026-11-01")).toBe(-2);
  });
  it("adds months with the day clamped", () => {
    expect(addMonths("2026-12-01", 6)).toBe("2027-06-01");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-12-31", 2)).toBe("2028-02-29");
  });
  it("parses percentages into basis points", () => {
    expect(percentToBps("20")).toBe(2000);
    expect(percentToBps("6.25%")).toBe(625);
    expect(percentToBps("0")).toBeNull();
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
  });
});

describe("plan needs", () => {
  it("works out accounts and leads per week from the default assumptions", () => {
    const n = planNeeds(settings);
    expect(n.residential).toBe(18); // 6400 / (180 x 2) = 17.8
    expect(n.commercial).toBe(6); // 3600 / 600
    expect(n.totalClients).toBe(24);
    expect(n.leadsTotal).toBe(120); // 24 / 20%
    expect(n.leadsPerWeek).toBe(4.7); // 120 leads over 26 weeks = 4.6154, rounded up to a tenth
    expect(n.acquisitionBudgetCents).toBe(600000);
  });
  it("moves when an assumption is edited", () => {
    const n = planNeeds({ ...settings, resVisitPriceCents: 20000, closeRateBps: 4000, commAccountValueCents: 90000 });
    expect(n.residential).toBe(16);
    expect(n.commercial).toBe(4);
    expect(n.leadsTotal).toBe(50);
  });
  it("does not divide by zero", () => {
    expect(planNeeds({ ...settings, residentialTargetCents: 0, commercialTargetCents: 0 })).toMatchObject({ totalClients: 0, leadsTotal: 0, leadsPerWeek: 0 });
  });
});

describe("plan position and milestones", () => {
  it("is before, during and after the six months", () => {
    expect(planPosition("2026-11-02", "2026-12-01")).toEqual({ phase: "before", monthIndex: -1, daysUntilStart: 29 });
    expect(planPosition("2026-12-01", "2026-12-01")).toMatchObject({ phase: "active", monthIndex: 0 });
    expect(planPosition("2027-05-31", "2026-12-01")).toMatchObject({ phase: "active", monthIndex: 5 });
    expect(planPosition("2027-06-01", "2026-12-01")).toMatchObject({ phase: "after", monthIndex: 6 });
  });
  it("uses the New York month's milestone, the first before the start and the last after the end", () => {
    expect(currentMilestone(MILESTONES, "2027-02-01")?.targetCents).toBe(400000);
    expect(currentMilestone(MILESTONES, "2026-11-01")?.targetCents).toBe(100000);
    expect(currentMilestone(MILESTONES, "2027-09-01")?.targetCents).toBe(1000000);
    expect(currentMilestone([], "2026-12-01")).toBeNull();
  });
  it("accepts a milestone change only when it still adds up", () => {
    const base = { startDate: "2026-12-01", residentialCents: 640000, commercialCents: 360000, milestonesCents: [100000, 250000, 400000, 600000, 800000, 1000000] };
    expect(planSchema.safeParse(base).success).toBe(true);
    expect(planSchema.safeParse({ ...base, milestonesCents: [100000, 250000, 200000, 600000, 800000, 1000000] }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, milestonesCents: [100000, 250000, 400000, 600000, 800000, 900000] }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, milestonesCents: [100000, 250000, 400000, 600000, 800000] }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, residentialCents: 700000, commercialCents: 500000, milestonesCents: [150000, 300000, 500000, 750000, 1000000, 1200000] }).success).toBe(true);
  });
});

describe("pace", () => {
  const month = { monthStart: "2026-12-01", nextMonthStart: "2027-01-01" };
  it("is on track at the straight-line pace", () => {
    // Day 16 of 31 against $4,000: expected 16/31 x 400000 = 206452
    const p = paceForMonth({ ...month, today: "2026-12-16", targetCents: 400000, revenueCents: 206452 });
    expect(p.expectedToDateCents).toBe(206452);
    expect(p.daysAhead).toBe(0);
    expect(p.status).toBe("on_track");
  });
  it("is ahead by whole days of the goal", () => {
    const p = paceForMonth({ ...month, today: "2026-12-16", targetCents: 310000, revenueCents: 160000 + 30000 });
    expect(p.expectedToDateCents).toBe(160000);
    expect(p.daysAhead).toBe(3); // 30,000 / (310,000 / 31 = 10,000 a day)
    expect(p.status).toBe("ahead");
  });
  it("is behind, and the band edge counts as ahead or behind", () => {
    const behind = paceForMonth({ ...month, today: "2026-12-16", targetCents: 310000, revenueCents: 160000 - 20000 });
    expect(behind.daysAhead).toBe(-2);
    expect(behind.status).toBe("behind");
    const near = paceForMonth({ ...month, today: "2026-12-16", targetCents: 310000, revenueCents: 160000 - 10000 });
    expect(near.status).toBe("on_track");
    expect(PACE_BAND_DAYS).toBe(2);
  });
  it("handles the first and last day of the month", () => {
    expect(paceForMonth({ ...month, today: "2026-12-01", targetCents: 310000, revenueCents: 0 }).expectedToDateCents).toBe(10000);
    const last = paceForMonth({ ...month, today: "2026-12-31", targetCents: 310000, revenueCents: 310000 });
    expect(last.expectedToDateCents).toBe(310000);
    expect(last.projectedCents).toBe(310000);
    expect(last.remainingCents).toBe(0);
  });
  it("uses a 28 and a 29 day February", () => {
    expect(paceForMonth({ monthStart: "2027-02-01", nextMonthStart: "2027-03-01", today: "2027-02-14", targetCents: 280000, revenueCents: 140000 }).daysAhead).toBe(0);
    expect(paceForMonth({ monthStart: "2028-02-01", nextMonthStart: "2028-03-01", today: "2028-02-29", targetCents: 290000, revenueCents: 290000 }).status).toBe("on_track");
  });
  it("treats a month with no target as on track", () => {
    expect(paceForMonth({ ...month, today: "2026-12-16", targetCents: 0, revenueCents: 5000 }).status).toBe("on_track");
  });
  it("finds the month the full goal was reached, and how early", () => {
    const m = MILESTONES.map((x, i) => ({ ...x, actualCents: i === 3 ? 1000000 : 0 }));
    expect(goalReached(m, 1000000, "2027-06-10")).toEqual({ monthStart: m[3].monthStart, monthsEarly: 2 });
    expect(goalReached(m, 1000000, "2027-02-10")).toBeNull();
    expect(goalReached(MILESTONES, 1000000, "2027-06-10")).toBeNull();
  });
});

describe("ad metrics", () => {
  const needs = planNeeds(settings);
  it("computes cost per lead, per booked client and payback", () => {
    const m = adMetrics(inputs(), needs);
    expect(m.costPerLeadCents).toBe(3000);
    expect(m.costPerBookedCents).toBe(15000);
    expect(m.cacSource).toBe("actual");
    expect(m.cacCents).toBe(15000);
    // (10 residential at $360 + 2 accounts at $600) / 12 = $400 a month; 40% margin = $160 a month
    expect(m.avgMonthlyClientValueCents).toBe(40000);
    expect(m.paybackMonths).toBe(0.94);
  });
  it("assumes the cost per client until there are enough bookings", () => {
    const m = adMetrics(inputs({ ads: { ...inputs().ads, booked30: 2 } }), needs);
    expect(m.cacSource).toBe("assumed");
    expect(m.cacCents).toBe(25000);
    expect(m.paybackMonths).toBe(1.56);
  });
  it("reports no cost per lead without leads", () => {
    const m = adMetrics(inputs({ ads: { ...inputs().ads, leads30: 0, booked30: 0 } }), needs);
    expect(m.costPerLeadCents).toBeNull();
    expect(m.costPerBookedCents).toBeNull();
  });
  it("tracks spend against the monthly budget", () => {
    const at = (spend: number) => adMetrics(inputs({ ads: { ...inputs().ads, spendMonthCents: spend } }), needs);
    expect(at(30000)).toMatchObject({ budgetUsedPercent: 30, budgetStatus: "under" });
    expect(at(80000)).toMatchObject({ budgetUsedPercent: 80, budgetStatus: "near" });
    expect(at(100000).budgetStatus).toBe("near");
    expect(at(100001).budgetStatus).toBe("over");
  });
  it("weights client value by the plan when there are no clients yet", () => {
    expect(avgMonthlyClientValueCents(settings, 0, 0, needs)).toBe(Math.round((18 * 36000 + 6 * 60000) / 24));
  });
});

describe("capacity", () => {
  it("compares weekly cleans needed with what cleaners cover, warning at 80%", () => {
    // 10 clients x 2 + 8 commercial visits = 28 a month = 6.46 a week against 3 x 12 = 36
    const c = capacity(inputs());
    expect(c.neededPerWeek).toBe(6.5);
    expect(c.capacityPerWeek).toBe(36);
    expect(c.status).toBe("ok");
  });
  it("warns at 80% and flags over 100%", () => {
    const at = (cleaners: number) => capacity(inputs({ capacity: { activeCleaners: cleaners, scheduledNext7Days: 0 }, settings: { ...settings, cleansPerCleanerPerWeek: 1 } }));
    // needed 6.46 a week: 8 -> 81% warn, 6 -> 108% over, 9 -> 72% ok
    expect(at(8).status).toBe("warn");
    expect(at(6).status).toBe("over");
    expect(at(9).status).toBe("ok");
  });
  it("is over capacity with clients and no cleaners", () => {
    expect(capacity(inputs({ capacity: { activeCleaners: 0, scheduledNext7Days: 0 } })).status).toBe("over");
  });
});

describe("cash", () => {
  const cash = inputs().cash!;
  it("starts from capital, adds collections and takes out payouts, ads and fixed costs", () => {
    const c = cashPosition(settings, { ...cash, fixedMonths: 2 }, 30000);
    // 500,000 + 300,000 - 100,000 - 30,000 - 2 x 150,000
    expect(c.onHandCents).toBe(370000);
    expect(c.fixedCostsChargedCents).toBe(300000);
    expect(c.status).toBe("ok");
  });
  it("warns at the buffer and goes negative below zero", () => {
    expect(cashPosition(settings, { ...cash, collectedCents: -270000 }, 0).status).toBe("low"); // 100,000 exactly: not above the buffer
    expect(cashPosition(settings, { ...cash, collectedCents: -269999 }, 0).onHandCents).toBe(100001);
    expect(cashPosition(settings, { ...cash, collectedCents: -269999 }, 0).status).toBe("ok");
    expect(cashPosition(settings, { ...cash, collectedCents: -800000 }, 0).status).toBe("negative");
  });
  it("works out runway from the last 30 days, and none when cash grows", () => {
    // burn = 150,000 fixed + 60,000 ads + 100,000 payouts - 400,000 collected < 0
    expect(cashPosition(settings, { ...cash, last30: { collectedCents: 400000, payoutsCents: 100000, adSpendCents: 60000 } }, 0).runwayMonths).toBeNull();
    const burning = cashPosition(settings, { ...cash, last30: { collectedCents: 50000, payoutsCents: 100000, adSpendCents: 60000 } }, 0);
    expect(burning.netBurn30Cents).toBe(260000);
    expect(burning.runwayMonths).toBe(round1(burning.onHandCents / 260000));
  });
  it("shows what is left after the rest of the ad budget", () => {
    expect(cashPosition(settings, cash, 30000).afterBudgetCents).toBe(cashPosition(settings, cash, 30000).onHandCents - 70000);
  });
});
const round1 = (n: number) => Math.round(n * 10) / 10;

describe("scale light", () => {
  function light(over: Partial<GrowthInputs> = {}, settingsOver: Partial<GrowthInputs["settings"]> = {}) {
    const i = inputs({ ...over, settings: { ...settings, ...settingsOver } });
    const needs = planNeeds(i.settings);
    const ads = adMetrics(i, needs);
    return scaleLight({ reply: i.reply, replyTargetMinutes: i.settings.replyTargetMinutes, capacity: capacity(i), ads, cash: cashPosition(i.settings, i.cash!, i.ads.spendMonthCents) });
  }
  it("is green only when all four conditions hold", () => {
    const l = light();
    expect(l.status).toBe("green");
    expect(l.blocking).toEqual([]);
  });
  it("names a slow reply time as the blocker", () => {
    const slow = light({ reply: { medianMinutes: 7, sample: 12 } });
    expect(slow.status).toBe("amber");
    expect(slow.blocking.map((b) => b.key)).toEqual(["reply"]);
    const slower = light({ reply: { medianMinutes: 20, sample: 12 } });
    expect(slower.status).toBe("red");
    expect(light({ reply: { medianMinutes: 5, sample: 12 } }).blocking.map((b) => b.key)).toEqual(["reply"]); // exactly at the target is not under it
  });
  it("is amber when there is nothing to measure", () => {
    const l = light({ reply: { medianMinutes: null, sample: 0 } });
    expect(l.status).toBe("amber");
    expect(l.blocking[0]).toMatchObject({ key: "reply", state: "unknown" });
  });
  it("names capacity at or over 80%", () => {
    const warn = light({ capacity: { activeCleaners: 1, scheduledNext7Days: 0 } }, { cleansPerCleanerPerWeek: 8 }); // 6.46 / 8 = 81%
    expect(warn.status).toBe("amber");
    expect(warn.blocking.map((b) => b.key)).toEqual(["capacity"]);
    const over = light({ capacity: { activeCleaners: 1, scheduledNext7Days: 0 } }, { cleansPerCleanerPerWeek: 5 });
    expect(over.status).toBe("red");
  });
  it("names slow CAC payback", () => {
    const slow = light({ ads: { ...inputs().ads, booked30: 4, spend30Cents: 400000 } }); // $1,000 a client / $160 a month = 6.25 months
    expect(slow.status).toBe("red");
    expect(slow.blocking.map((b) => b.key)).toEqual(["payback"]);
    const edge = light({ ads: { ...inputs().ads, booked30: 4, spend30Cents: 192000 } }); // $480 / $160 = 3.0 months, not under 3
    expect(edge.blocking.map((b) => b.key)).toEqual(["payback"]);
    expect(edge.status).toBe("amber");
  });
  it("names the cash buffer, and looks ahead to the rest of the month's ad budget", () => {
    const low = light({ cash: { ...inputs().cash!, collectedCents: -700000 } });
    expect(low.status).toBe("red");
    expect(low.blocking.map((b) => b.key)).toEqual(["cash"]);
    // 170,000 on hand is above the buffer, but 100,000 budget with 30,000 spent leaves 70,000 to spend: 100,000 after
    const ahead = light({ cash: { ...inputs().cash!, collectedCents: -230000 } });
    expect(ahead.status).toBe("amber");
    expect(ahead.blocking[0].detail).toMatch(/would drop/);
  });
  it("lists every blocker", () => {
    const l = light({ reply: { medianMinutes: 30, sample: 5 }, capacity: { activeCleaners: 1, scheduledNext7Days: 0 } }, { cleansPerCleanerPerWeek: 5 });
    expect(l.blocking.map((b) => b.key)).toEqual(["reply", "capacity"]);
    expect(l.summary).toMatch(/lead reply time, cleaner capacity/);
  });
});

describe("snapshot", () => {
  it("assembles the goal, pace, ads, capacity, cash and light", () => {
    const s = buildCoreSnapshot(inputs(), new Date("2026-12-16T15:00:00Z"));
    expect(s.pace).toMatchObject({ phase: "active", planMonth: 1, milestoneCents: 100000, revenueCents: 50000 });
    expect(s.goal).toMatchObject({ deadline: "2027-06-01", monthlyGoalCents: 1000000 });
    expect(s.clients.residential).toEqual({ have: 10, need: 18 });
    expect(s.leads).toEqual({ perWeekActual: 7, perWeekNeeded: 4.7, last28: 28 });
    expect(s.cash?.onHandCents).toBe(670000);
    expect(s.scaleLight?.status).toBe("green");
    expect(s.includesDemo).toBe(false);
    expect(s.generatedAt).toBe("2026-12-16T15:00:00.000Z");
  });
  it("sits at zero target before the plan starts and says how long to go", () => {
    const s = buildCoreSnapshot(inputs({ today: "2026-11-02", monthStart: "2026-11-01", nextMonthStart: "2026-12-01" }));
    expect(s.pace).toMatchObject({ phase: "before", planMonth: null, daysUntilStart: 29, status: "on_track" });
  });
  it("hides cash and the light from staff and flags demo data", () => {
    const s = buildCoreSnapshot(inputs({ cash: null, demo: { adSpend: true, leads: false, jobs: false, invoices: false, payments: false } }));
    expect(s.cash).toBeNull();
    expect(s.scaleLight).toBeNull();
    expect(s.includesDemo).toBe(true);
  });
  it("round-trips the shape the database returns", () => {
    expect(growthInputsSchema.safeParse(JSON.parse(JSON.stringify(inputs()))).success).toBe(true);
    expect(growthInputsSchema.safeParse({ ...inputs(), cash: undefined }).success).toBe(false);
  });
});
