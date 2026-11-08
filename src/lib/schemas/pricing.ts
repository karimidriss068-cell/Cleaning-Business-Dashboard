import { z } from "zod";

// Pricing rules: the owner's numbers for bids. Money is integer cents, shares are basis points; the
// database checks the same ranges again (pricing_rules, save_pricing_rules).

export const SPACE_TYPES = ["office", "retail", "medical", "post_construction", "warehouse", "common_areas"] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];
export const spaceTypeLabel: Record<SpaceType, string> = {
  office: "Office",
  retail: "Retail",
  medical: "Medical",
  post_construction: "Post-construction",
  warehouse: "Warehouse",
  common_areas: "Common areas",
};

const int = (min: number, max: number, msg: string) => z.number({ message: msg }).int(msg).min(min, msg).max(max, msg);

export const spaceRateSchema = z.object({
  spaceType: z.enum(SPACE_TYPES),
  ratePerKsqftCents: int(0, 100_000_000, "Enter a rate in dollars, like 300"),
  productivitySqftPerHour: int(50, 20000, "Between 50 and 20,000 sq ft per hour"),
});

export const pricingRulesSchema = z
  .object({
    laborRateCents: int(100, 100_000, "Between $1 and $1,000 an hour"),
    crewSizeDefault: int(1, 30, "Between 1 and 30 people"),
    materialsBps: int(0, 10_000, "Between 0% and 100%"),
    travelCents: int(0, 100_000_000, "Enter dollars, like 25"),
    contingencyBps: int(0, 5_000, "Between 0% and 50%"),
    minimumProjectCents: int(0, 1_000_000_000, "Enter dollars, like 1500"),
    rushMultiplierBps: int(10_000, 30_000, "Between 100% and 300% of normal price"),
    marginTargetBps: int(0, 9_000, "Between 0% and 90%"),
    marginFloorBps: int(0, 9_000, "Between 0% and 90%"),
    sellingRateCents: int(0, 1_000_000, "Enter dollars an hour, like 40"),
    spaceRates: z.array(spaceRateSchema).length(SPACE_TYPES.length, "A rate for every kind of space"),
  })
  .strict()
  .refine((r) => new Set(r.spaceRates.map((s) => s.spaceType)).size === r.spaceRates.length, { path: ["spaceRates"], message: "Each kind of space once" })
  .refine((r) => r.marginFloorBps <= r.marginTargetBps, { path: ["marginFloorBps"], message: "The floor can't be above the target" });
export type PricingRules = z.infer<typeof pricingRulesSchema>;

export const savePricingSchema = z.object({ expectedVersion: z.number().int().min(1), rules: pricingRulesSchema });

/** What pricing_rules_snapshot() returns: the rules plus the version and whether the owner has confirmed them. */
export const pricingSnapshotSchema = z.object({ version: z.number().int().min(1), confirmed: z.boolean() }).and(pricingRulesSchema);
export type PricingSnapshot = z.infer<typeof pricingSnapshotSchema>;
