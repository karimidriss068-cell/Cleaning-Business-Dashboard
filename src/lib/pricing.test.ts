import { describe, expect, it } from "vitest";
import { bpsToPercentInput, centsToDollarInput, dollarInputToCents, percentInputToBps, ratePerSqftLabel } from "@/lib/pricing";
import { pricingRulesSchema, pricingSnapshotSchema } from "@/lib/schemas/pricing";

const rules = {
  laborRateCents: 2500, crewSizeDefault: 2, materialsBps: 800, travelCents: 0, contingencyBps: 0, minimumProjectCents: 150000,
  rushMultiplierBps: 12500, marginTargetBps: 3000, marginFloorBps: 2000, sellingRateCents: 4000,
  spaceRates: ["office", "retail", "medical", "post_construction", "warehouse", "common_areas"].map((spaceType) => ({ spaceType, ratePerKsqftCents: 30000, productivitySqftPerHour: 1500 })),
};

describe("form conversions", () => {
  it("shows whole dollars plainly and others with cents", () => {
    expect(centsToDollarInput(2500)).toBe("25");
    expect(centsToDollarInput(2550)).toBe("25.50");
  });
  it("round-trips percentages through basis points", () => {
    expect(bpsToPercentInput(3000)).toBe("30");
    expect(bpsToPercentInput(2550)).toBe("25.5");
    expect(percentInputToBps("25.5")).toBe(2550);
    expect(percentInputToBps(" 30 % ")).toBe(3000);
    expect(percentInputToBps("0.29")).toBe(29);
  });
  it("refuses what isn't a percentage or has more than two decimals", () => {
    for (const bad of ["", "abc", "-5", "12.345", "1,5"]) expect(percentInputToBps(bad)).toBeNull();
  });
  it("turns typed dollars into cents and refuses negatives", () => {
    expect(dollarInputToCents("$1,500")).toBe(150000);
    expect(dollarInputToCents("0.29")).toBe(29);
    expect(dollarInputToCents("-3")).toBeNull();
    expect(dollarInputToCents("x")).toBeNull();
  });
  it("shows a per-1,000-sq-ft rate as dollars per sq ft", () => expect(ratePerSqftLabel(30000)).toBe("$0.30"));
});

describe("pricingRulesSchema", () => {
  it("accepts the shipped placeholders", () => expect(pricingRulesSchema.safeParse(rules).success).toBe(true));
  it("refuses a floor above the target, with the message on the floor", () => {
    const r = pricingRulesSchema.safeParse({ ...rules, marginFloorBps: 3500 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ["marginFloorBps"], message: "The floor can't be above the target" });
  });
  it("refuses a margin of 100% or more (price would be infinite)", () => expect(pricingRulesSchema.safeParse({ ...rules, marginTargetBps: 10000 }).success).toBe(false));
  it("refuses fractional cents, unknown fields, a missing or repeated space type", () => {
    expect(pricingRulesSchema.safeParse({ ...rules, laborRateCents: 25.5 }).success).toBe(false);
    expect(pricingRulesSchema.safeParse({ ...rules, extra: 1 }).success).toBe(false);
    expect(pricingRulesSchema.safeParse({ ...rules, spaceRates: rules.spaceRates.slice(1) }).success).toBe(false);
    expect(pricingRulesSchema.safeParse({ ...rules, spaceRates: [...rules.spaceRates.slice(1), rules.spaceRates[1]] }).success).toBe(false);
  });
  it("refuses a rush multiplier under 1x", () => expect(pricingRulesSchema.safeParse({ ...rules, rushMultiplierBps: 9000 }).success).toBe(false));
  it("reads the database snapshot with its version", () => expect(pricingSnapshotSchema.safeParse({ ...rules, version: 3, confirmed: false }).success).toBe(true));
});
