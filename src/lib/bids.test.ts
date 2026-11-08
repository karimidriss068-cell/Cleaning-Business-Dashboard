import { describe, expect, it } from "vitest";
import { computeBid, marginBps, priceForMargin } from "@/lib/bids";
import { bidInputsSchema, type BidInputs } from "@/lib/schemas/bids";
import type { PricingRules } from "@/lib/schemas/pricing";

const rules: PricingRules = {
  laborRateCents: 2500, crewSizeDefault: 2, materialsBps: 800, travelCents: 0, contingencyBps: 0, minimumProjectCents: 150000,
  rushMultiplierBps: 12500, marginTargetBps: 3000, marginFloorBps: 2000, sellingRateCents: 4000,
  spaceRates: [
    { spaceType: "office", ratePerKsqftCents: 30000, productivitySqftPerHour: 1500 },
    { spaceType: "retail", ratePerKsqftCents: 28000, productivitySqftPerHour: 1600 },
    { spaceType: "medical", ratePerKsqftCents: 45000, productivitySqftPerHour: 1000 },
    { spaceType: "post_construction", ratePerKsqftCents: 65000, productivitySqftPerHour: 600 },
    { spaceType: "warehouse", ratePerKsqftCents: 18000, productivitySqftPerHour: 2500 },
    { spaceType: "common_areas", ratePerKsqftCents: 25000, productivitySqftPerHour: 1800 },
  ],
};
const base: BidInputs = { areas: [{ label: "Floor 1", spaceType: "office", sqft: 30000 }], cleans: 1, crewSize: 2, rush: false, overrides: {} };

describe("margin and price", () => {
  it("margin is profit over price, not over cost", () => {
    expect(marginBps(100000, 70000)).toBe(3000);
    expect(marginBps(100000, 100000)).toBe(0);
    expect(marginBps(100000, 130000)).toBe(-3000);
  });
  it("rounds margin toward zero, like the database does", () => {
    expect(marginBps(300, 200)).toBe(3333);
    expect(marginBps(300, 400)).toBe(-3333);
  });
  it("the price for a target margin gives at least that margin, rounded up to the cent", () => {
    expect(priceForMargin(70000, 3000)).toBe(100000);
    for (const [cost, m] of [[64800, 3000], [12345, 2750], [999, 3333], [1, 9000]] as const) {
      const p = priceForMargin(cost, m);
      expect(marginBps(p, cost)).toBeGreaterThanOrEqual(m);
      expect(marginBps(p - 1, cost)).toBeLessThan(m);
    }
  });
  it("refuses a margin of 100% or more", () => expect(() => priceForMargin(100, 10000)).toThrow(RangeError));
});

describe("computeBid", () => {
  it("prices a simple office floor from hours, labor, supplies and the margin target", () => {
    const b = computeBid(base, rules);
    expect(b.hoursPerClean).toBe(20); // 30,000 sq ft / 1,500 per cleaner-hour
    expect(b.costLines).toEqual([{ label: "Labor", cents: 50000 }, { label: "Supplies and equipment", cents: 4000 }]);
    expect(b.costCents).toBe(54000);
    expect(b.targetPriceCents).toBe(77143); // 54,000 / 0.70 rounded up
    expect(b.minimumApplied).toBe(true);
    expect(b.suggestedPriceCents).toBe(150000); // the $1,500 minimum wins
    expect(b.listPriceCents).toBe(900000); // 30 x $300 per 1,000 sq ft
    expect(b.onSiteHoursPerPerson).toBe(10);
  });
  it("sums areas, multiplies by the number of cleans and adds travel and contingency", () => {
    const b = computeBid({ ...base, areas: [{ label: "A", spaceType: "office", sqft: 30000 }, { label: "B", spaceType: "post_construction", sqft: 6000 }], cleans: 3 }, { ...rules, travelCents: 2000, contingencyBps: 500 });
    expect(b.hoursPerClean).toBe(30); // 20 + 10
    expect(b.totalHours).toBe(90);
    const labor = 90 * 2500;
    const materials = Math.round((labor * 800) / 10000);
    const travel = 6000;
    const contingency = Math.round(((labor + materials + travel) * 500) / 10000);
    expect(b.costLines.map((l) => l.cents)).toEqual([labor, materials, travel, contingency]);
    expect(b.costCents).toBe(labor + materials + travel + contingency);
    expect(b.listPriceCents).toBe((900000 + 390000) * 3); // $9,000 + $3,900 a clean, three cleans
  });
  it("reaches the target margin when the suggestion isn't the minimum", () => {
    const b = computeBid({ ...base, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }] }, rules);
    expect(b.minimumApplied).toBe(false);
    expect(b.priceCents).toBe(b.targetPriceCents);
    expect(b.marginBps).toBeGreaterThanOrEqual(3000);
    expect(b.belowTarget).toBe(false);
    expect(b.belowFloor).toBe(false);
  });
  it("rush work is priced at the rush multiple", () => {
    const normal = computeBid({ ...base, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }] }, rules);
    const rush = computeBid({ ...base, rush: true, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }] }, rules);
    expect(rush.rushApplied).toBe(true);
    expect(rush.suggestedPriceCents).toBe(Math.round((normal.suggestedPriceCents * 12500) / 10000));
  });
  it("uses overrides for labor rate, supplies, margin target and price, and reports the margin of what is charged", () => {
    const b = computeBid({ ...base, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }], overrides: { laborRateCents: 3000, materialsCents: 10000, marginTargetBps: 4000, priceCents: 400000 } }, rules);
    expect(b.costLines[0]).toEqual({ label: "Labor", cents: 200 * 3000 });
    expect(b.costLines[1]).toEqual({ label: "Supplies and equipment", cents: 10000 });
    expect(b.marginTargetBps).toBe(4000);
    expect(b.priceOverridden).toBe(true);
    expect(b.priceCents).toBe(400000);
    expect(b.marginBps).toBe(marginBps(400000, b.costCents));
    expect(b.belowFloor).toBe(true);
  });
  it("flags a price below the floor and one that is between floor and target", () => {
    const cheap = computeBid({ ...base, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }], overrides: { priceCents: 1 } }, rules);
    expect(cheap.belowFloor).toBe(true);
    const t = computeBid({ ...base, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }] }, rules);
    const between = computeBid({ ...base, areas: [{ label: "Big", spaceType: "post_construction", sqft: 120000 }], overrides: { priceCents: Math.floor(t.costCents / 0.75) } }, rules);
    expect(between.belowFloor).toBe(false);
    expect(between.belowTarget).toBe(true);
  });
  it("is exact in integer cents for every line", () => {
    const b = computeBid({ ...base, areas: [{ label: "Odd", spaceType: "medical", sqft: 7777 }], cleans: 7 }, rules);
    for (const l of b.costLines) expect(Number.isInteger(l.cents)).toBe(true);
    expect(Number.isInteger(b.priceCents)).toBe(true);
    expect(b.costCents).toBe(b.costLines.reduce((t, l) => t + l.cents, 0));
  });
  it("throws for a space type with no rate rather than guessing", () => {
    expect(() => computeBid(base, { ...rules, spaceRates: rules.spaceRates.slice(1) })).toThrow(RangeError);
  });
});

describe("bidInputsSchema", () => {
  it("accepts a normal bid and defaults the overrides", () => {
    const r = bidInputsSchema.safeParse({ areas: base.areas, cleans: 1, crewSize: 2, rush: false });
    expect(r.success).toBe(true);
  });
  it("refuses no areas, a zero or fractional size, and unknown fields", () => {
    expect(bidInputsSchema.safeParse({ ...base, areas: [] }).success).toBe(false);
    expect(bidInputsSchema.safeParse({ ...base, areas: [{ label: "A", spaceType: "office", sqft: 0 }] }).success).toBe(false);
    expect(bidInputsSchema.safeParse({ ...base, areas: [{ label: "A", spaceType: "office", sqft: 10.5 }] }).success).toBe(false);
    expect(bidInputsSchema.safeParse({ ...base, hack: 1 }).success).toBe(false);
  });
});
