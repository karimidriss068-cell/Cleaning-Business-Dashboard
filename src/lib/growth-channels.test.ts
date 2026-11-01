import { describe, expect, it } from "vitest";
import {
  channelFunnels,
  channelTestRows,
  churnTracker,
  dailyBudgetToday,
  funnelView,
  plannedTestSpendCents,
  recommend,
  replyBuckets,
  sumFunnel,
  testBudgetCheck,
  testRules,
  type TestRules,
} from "@/lib/growth-channels";
import { EXTENDED } from "@/lib/growth-fixture";
import type { GrowthInputs } from "@/lib/schemas/growth";

const rules: TestRules = { ...testRules(EXTENDED.settingsExtra), startDate: "2026-12-01" };
const chan = (over: Partial<GrowthInputs["channelTest"]["channels"][number]> & { key: string }): GrowthInputs["channelTest"]["channels"][number] => ({
  enabled: true,
  spendCents: 0,
  leads: 0,
  booked: 0,
  recent: { spendCents: 0, leads: 0 },
  prior: { spendCents: 0, leads: 0 },
  ...over,
});
const test = (...channels: GrowthInputs["channelTest"]["channels"]): GrowthInputs["channelTest"] => ({ fromDate: "2026-12-01", channels });

describe("funnel", () => {
  const meta = EXTENDED.funnel.channels[0]; // 40 leads, 30 contacted, 20 quoted, 10 booked, 8 first clean, 5 recurring, $600
  it("shows counts, conversion from the previous stage and from leads, and cost per stage", () => {
    const f = funnelView(meta, "Meta");
    expect(f.stages.map((s) => s.count)).toEqual([40, 30, 20, 10, 8, 5]);
    expect(f.stages.map((s) => s.fromPreviousPercent)).toEqual([null, 75, 67, 50, 80, 63]);
    expect(f.stages.map((s) => s.fromLeadsPercent)).toEqual([null, 75, 50, 25, 20, 13]);
    expect(f.stages[0].costCents).toBe(1500); // $600 over 40 leads
    expect(f.stages[3].costCents).toBe(6000);
    expect(f.costPerBookedCents).toBe(6000);
    expect(f.costPerRecurringCents).toBe(12000);
  });
  it("has no cost or conversion where nobody got that far", () => {
    const f = funnelView({ key: "x", leads: 0, contacted: 0, quoted: 0, booked: 0, firstClean: 0, recurring: 0, spendCents: 5000 });
    expect(f.costPerBookedCents).toBeNull();
    expect(f.costPerRecurringCents).toBeNull();
    expect(f.stages.every((s) => s.fromPreviousPercent === null && s.costCents === null)).toBe(true);
    const spent = funnelView({ key: "x", leads: 10, contacted: 0, quoted: 0, booked: 0, firstClean: 0, recurring: 0, spendCents: 5000 });
    expect(spent.stages[1].fromPreviousPercent).toBe(0);
  });
  it("adds channels into the headline cost per booked and per recurring client", () => {
    const t = funnelView(sumFunnel(EXTENDED.funnel.channels), "All");
    expect(t.stages.map((s) => s.count)).toEqual([80, 63, 39, 20, 17, 12]);
    expect(t.spendCents).toBe(150000);
    expect(t.costPerBookedCents).toBe(7500); // $1,500 / 20
    expect(t.costPerRecurringCents).toBe(12500); // $1,500 / 12
  });
  it("lists all six channels in order, filling zeros", () => {
    const c = channelFunnels([EXTENDED.funnel.channels[0]]);
    expect(c.map((x) => x.name)).toEqual(["Meta", "Google Search", "Google LSA", "Referral", "Organic", "Other"]);
    expect(c[1].stages[0].count).toBe(0);
  });
});

describe("reply time", () => {
  it("shows the booking rate of each bucket", () => {
    const r = replyBuckets(EXTENDED.replyBuckets);
    expect(r.buckets.map((b) => b.label)).toEqual(["Under 5 minutes", "5 to 60 minutes", "Over 1 hour"]);
    expect(r.buckets.map((b) => b.bookingRatePercent)).toEqual([40, 27, 10]);
    expect(r.unanswered).toBe(5);
  });
  it("has no rate for an empty bucket", () => {
    expect(replyBuckets({ under5: { leads: 0, booked: 0 }, under60: { leads: 0, booked: 0 }, over60: { leads: 0, booked: 0 }, unanswered: 0 }).buckets[0].bookingRatePercent).toBeNull();
  });
});

describe("churn", () => {
  it("is cancellations divided by recurring clients at the start of the month", () => {
    const c = churnTracker(EXTENDED.churn, 500);
    expect(c.months.map((m) => m.rateBps)).toEqual([500, 800]);
    expect(c.averageBps).toBe(667); // 3 of 45
    expect(c.assumedBps).toBe(500);
  });
  it("has no rate before there are recurring clients", () => {
    const c = churnTracker([{ monthStart: "2026-11-01", startRecurring: 0, cancellations: 0 }], 500);
    expect(c.months[0].rateBps).toBeNull();
    expect(c.averageBps).toBeNull();
  });
});

describe("channel rules", () => {
  it("judges a channel only after both the spend and the leads", () => {
    const rows = (spend: number, leads: number) => channelTestRows(test(chan({ key: "meta", spendCents: spend, leads, booked: 5 })), rules).find((r) => r.key === "meta");
    expect(rows(75000, 20)?.judged).toBe(true);
    expect(rows(74999, 20)?.judged).toBe(false);
    expect(rows(75000, 19)?.judged).toBe(false);
    expect(rows(74999, 20)).toMatchObject({ needsSpendCents: 1, needsLeads: 0, status: "needs_data" });
  });
  const two = (googleSpend: number, googleBooked: number) =>
    channelTestRows(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10 }), chan({ key: "google_search", spendCents: googleSpend, leads: 30, booked: googleBooked })), rules);
  it("picks the cheapest booked client as the best", () => {
    const r = two(160000, 10);
    expect(r.find((x) => x.key === "meta")?.status).toBe("best"); // $800 vs $1,600 for ten each
    expect(r.find((x) => x.key === "google_search")?.status).toBe("loser");
    expect(r.find((x) => x.key === "google_search")?.ratioToBest).toBe(2);
  });
  it("flags a loser at exactly 1.5x the best cost per booked client, not below", () => {
    expect(two(120000, 10).find((x) => x.key === "google_search")?.status).toBe("loser"); // $120 vs $80: exactly 1.5x
    expect(two(119900, 10).find((x) => x.key === "google_search")?.status).toBe("ok");
  });
  it("follows an edited ratio", () => {
    const strict = channelTestRows(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10 }), chan({ key: "google_search", spendCents: 100000, leads: 30, booked: 10 })), { ...rules, loserRatioX100: 120 });
    expect(strict.find((x) => x.key === "google_search")?.status).toBe("loser"); // 1.25x
  });
  it("calls a judged channel with no booked clients a loser once there is a best", () => {
    expect(two(150000, 0).find((x) => x.key === "google_search")).toMatchObject({ status: "loser", costPerBookedCents: null });
  });
  it("has no best when no judged channel booked anyone", () => {
    const r = channelTestRows(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 0 })), rules);
    expect(r.find((x) => x.key === "meta")?.status).toBe("ok");
  });
  it("shows unused channels as not testing, and an unpaid channel is never a loser", () => {
    const r = channelTestRows(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10 }), chan({ key: "referral", enabled: false, leads: 30, booked: 1 })), rules);
    expect(r.find((x) => x.key === "other")?.status).toBe("not_testing");
    expect(r.find((x) => x.key === "referral")?.status).not.toBe("loser");
  });
  it("sees a cost that is rising and needs enough leads to say so", () => {
    const rising = chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10, recent: { spendCents: 30000, leads: 10 }, prior: { spendCents: 20000, leads: 10 } });
    expect(channelTestRows(test(rising), rules)[0].trend).toMatchObject({ recentCplCents: 3000, priorCplCents: 2000, rising: true }); // +50%
    const flat = { ...rising, recent: { spendCents: 23900, leads: 10 } }; // +19.5%
    expect(channelTestRows(test(flat), rules)[0].trend?.rising).toBe(false);
    const thin = { ...rising, recent: { spendCents: 30000, leads: 4 } };
    expect(channelTestRows(test(thin), rules)[0].trend).toBeNull();
  });
});

describe("recommendation", () => {
  const rec = (rows: GrowthInputs["channelTest"], today = "2026-12-20", r = rules) => recommend(channelTestRows(rows, r), r, today);
  it("says keep testing, and what is still needed, before anything is judged", () => {
    const r = rec(test(chan({ key: "meta", spendCents: 40000, leads: 10 }), chan({ key: "google_search", spendCents: 10000, leads: 2 })));
    expect(r.state).toBe("keep_testing");
    expect(r.detail).toMatch(/Meta still needs \$350 more spend and 10 more leads/);
  });
  it("says shift 70% to the best and shut down the loser", () => {
    const r = rec(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10 }), chan({ key: "google_search", spendCents: 160000, leads: 30, booked: 10 })));
    expect(r).toMatchObject({ state: "shift", best: "meta", shutDown: ["google_search"], shiftPercent: 70 });
    expect(r.headline).toBe("Shift 70% to Meta, shut down Google Search");
  });
  it("says to keep scaling and add another channel when the best channel's cost is rising", () => {
    const meta = chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10, recent: { spendCents: 30000, leads: 10 }, prior: { spendCents: 20000, leads: 10 } });
    const r = rec(test(meta, chan({ key: "google_search", spendCents: 160000, leads: 30, booked: 10 })));
    expect(r.state).toBe("scale_add");
    expect(r.headline).toBe("Keep scaling Meta and add another channel");
    expect(r.shiftPercent).toBeNull();
  });
  it("keeps testing when no judged channel is a clear loser", () => {
    const r = rec(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10 }), chan({ key: "google_search", spendCents: 90000, leads: 30, booked: 10 })));
    expect(r.state).toBe("keep_testing");
    expect(r.best).toBe("meta");
    expect(r.detail).toMatch(/1\.5x/);
  });
  it("keeps testing when a judged channel has booked no one", () => {
    expect(rec(test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 0 }))).state).toBe("keep_testing");
  });
  it("reminds you to log a decision once the window has ended", () => {
    expect(rec(test(chan({ key: "meta", spendCents: 10000, leads: 2 })), "2027-01-05").detail).toMatch(/log your decision/);
    expect(rec(test(chan({ key: "meta", spendCents: 10000, leads: 2 })), "2026-12-28").detail).not.toMatch(/log your decision/);
  });
  it("only recommends: it has no side effects and the same input gives the same answer", () => {
    const rows = test(chan({ key: "meta", spendCents: 80000, leads: 30, booked: 10 }), chan({ key: "google_search", spendCents: 160000, leads: 30, booked: 10 }));
    expect(rec(rows)).toEqual(rec(rows));
  });
});

describe("test budget and the cash buffer", () => {
  it("plans week 1 at the first daily budget and the rest at the second, per channel", () => {
    expect(plannedTestSpendCents(rules, 1)).toBe(77000); // 7 x (2000 + 3 x 3000)
    expect(plannedTestSpendCents(rules, 3)).toBe(231000);
    expect(plannedTestSpendCents(rules, 0)).toBe(0);
    expect(plannedTestSpendCents({ ...rules, windowWeeks: 1 }, 2)).toBe(28000);
  });
  const check = (over: Partial<Parameters<typeof testBudgetCheck>[0]> = {}) =>
    testBudgetCheck({ rules, enabledCount: 3, spentSinceStartCents: 0, cashOnHandCents: 500000, bufferCents: 100000, ...over });
  it("allows a plan that leaves cash above the buffer", () => {
    expect(check()).toMatchObject({ ok: true, plannedCents: 231000, remainingCents: 231000, roomCents: 400000, message: null });
  });
  it("allows a plan that uses exactly the room", () => {
    expect(check({ cashOnHandCents: 331000 }).ok).toBe(true);
  });
  it("blocks a plan that would take cash under the buffer, saying by how much room there is", () => {
    const c = check({ cashOnHandCents: 330999 });
    expect(c.ok).toBe(false);
    expect(c.message).toBe("The test would spend $2,310 more, but only $2,310 of cash is above the $1,000 buffer.");
    const low = check({ cashOnHandCents: 200000 });
    expect(low.ok).toBe(false);
    expect(low.message).toMatch(/only \$1,000 of cash is above/);
  });
  it("blocks any spend when cash is already under the buffer", () => {
    const c = check({ cashOnHandCents: 80000 });
    expect(c.ok).toBe(false);
    expect(c.message).toMatch(/only \$0 of cash/);
    expect(check({ cashOnHandCents: 80000, enabledCount: 0 }).ok).toBe(true); // nothing planned
  });
  it("counts only what is still to be spent, since spend already made is out of cash", () => {
    const c = check({ cashOnHandCents: 250000, spentSinceStartCents: 100000 });
    expect(c.remainingCents).toBe(131000);
    expect(c.ok).toBe(true); // 131,000 fits in the 150,000 above the buffer
    expect(check({ spentSinceStartCents: 999999 }).remainingCents).toBe(0);
  });
  it("ignores spend when the test has no start date", () => {
    expect(testBudgetCheck({ rules: { ...rules, startDate: null }, enabledCount: 1, spentSinceStartCents: 50000, cashOnHandCents: 500000, bufferCents: 100000 }).remainingCents).toBe(77000);
  });
  it("gives the daily budget for week 1, then after, then none when the window ends", () => {
    expect(dailyBudgetToday(rules, "2026-11-30")).toEqual({ cents: 2000, phase: "not_started" });
    expect(dailyBudgetToday(rules, "2026-12-01")).toEqual({ cents: 2000, phase: "week1" });
    expect(dailyBudgetToday(rules, "2026-12-07")).toEqual({ cents: 2000, phase: "week1" });
    expect(dailyBudgetToday(rules, "2026-12-08")).toEqual({ cents: 3000, phase: "after" });
    expect(dailyBudgetToday(rules, "2026-12-29")).toEqual({ cents: 0, phase: "ended" });
    expect(dailyBudgetToday({ ...rules, startDate: null }, "2026-12-08").phase).toBe("not_started");
  });
});
