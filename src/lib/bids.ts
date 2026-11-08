// Bid math: cost from the pricing rules, the price that hits a margin target, and the margin a given price
// works out to. Pure and in integer cents, so it is tested exactly; the database sums the saved cost lines
// and recomputes the margin itself, so the margin floor can't be bypassed from the browser.
//
//   cost   = labor + supplies + travel + contingency
//   margin = (price - cost) / price            (a 30% margin on a $10,000 bid is $3,000 of profit)
//   price that hits a target margin m = cost / (1 - m), rounded up to the cent

import type { BidInputs } from "@/lib/schemas/bids";
import type { PricingRules, SpaceType } from "@/lib/schemas/pricing";

export type CostLine = { label: string; cents: number };

export type BidBreakdown = {
  /** Cleaner-hours for one clean, and for all cleans together. */
  hoursPerClean: number;
  totalHours: number;
  /** Hours each person on a crew of `crewSize` spends on site over all cleans. */
  onSiteHoursPerPerson: number;
  costLines: CostLine[];
  costCents: number;
  marginTargetBps: number;
  /** The price that earns the target margin, before the minimum and rush adjustments. */
  targetPriceCents: number;
  minimumApplied: boolean;
  rushApplied: boolean;
  /** What the rules suggest charging. */
  suggestedPriceCents: number;
  /** The rate-card price for the same scope (a benchmark, not a ceiling). */
  listPriceCents: number;
  /** What will be charged: the suggestion unless the owner overrode it. */
  priceCents: number;
  priceOverridden: boolean;
  marginBps: number;
  belowFloor: boolean;
  belowTarget: boolean;
};

const rateFor = (rules: PricingRules, t: SpaceType) => {
  const r = rules.spaceRates.find((s) => s.spaceType === t);
  if (!r) throw new RangeError(`no pricing rate for ${t}`);
  return r;
};

/** ceil(a / b) for non-negative integers. */
export const ceilDiv = (a: number, b: number): number => Math.ceil(a / b);

/** Margin in whole basis points, rounded toward zero; negative when price is below cost. */
export function marginBps(priceCents: number, costCents: number): number {
  if (priceCents <= 0) return -10000;
  return Math.trunc(((priceCents - costCents) * 10000) / priceCents);
}

/** The price that earns `marginBps` on a cost, rounded up to the cent. */
export function priceForMargin(costCents: number, targetBps: number): number {
  if (targetBps < 0 || targetBps >= 10000) throw new RangeError(`margin must be below 100%, got ${targetBps} bps`);
  return ceilDiv(costCents * 10000, 10000 - targetBps);
}

export function computeBid(inputs: BidInputs, rules: PricingRules): BidBreakdown {
  const o = inputs.overrides ?? {};
  const laborRate = o.laborRateCents ?? rules.laborRateCents;

  // Hours: each area's square feet over what one cleaner covers in an hour.
  let hoursPerClean = 0;
  let listPerClean = 0;
  for (const a of inputs.areas) {
    const r = rateFor(rules, a.spaceType);
    hoursPerClean += a.sqft / r.productivitySqftPerHour;
    listPerClean += Math.round((a.sqft * r.ratePerKsqftCents) / 1000);
  }
  const totalHours = hoursPerClean * inputs.cleans;

  const labor = Math.round(totalHours * laborRate);
  const materials = o.materialsCents ?? Math.round((labor * rules.materialsBps) / 10000);
  const travel = rules.travelCents * inputs.cleans;
  const contingency = Math.round(((labor + materials + travel) * rules.contingencyBps) / 10000);
  const costLines: CostLine[] = [
    { label: "Labor", cents: labor },
    { label: "Supplies and equipment", cents: materials },
    ...(travel > 0 ? [{ label: "Travel", cents: travel }] : []),
    ...(contingency > 0 ? [{ label: "Contingency", cents: contingency }] : []),
  ];
  const costCents = costLines.reduce((t, l) => t + l.cents, 0);

  const target = o.marginTargetBps ?? rules.marginTargetBps;
  const targetPriceCents = priceForMargin(costCents, target);
  const minimumApplied = targetPriceCents < rules.minimumProjectCents;
  const base = Math.max(targetPriceCents, rules.minimumProjectCents);
  const suggestedPriceCents = inputs.rush ? Math.round((base * rules.rushMultiplierBps) / 10000) : base;
  const priceOverridden = o.priceCents !== null && o.priceCents !== undefined;
  const priceCents = priceOverridden ? (o.priceCents as number) : suggestedPriceCents;
  const margin = marginBps(priceCents, costCents);

  return {
    hoursPerClean,
    totalHours,
    onSiteHoursPerPerson: totalHours / inputs.crewSize,
    costLines,
    costCents,
    marginTargetBps: target,
    targetPriceCents,
    minimumApplied,
    rushApplied: inputs.rush,
    suggestedPriceCents,
    listPriceCents: listPerClean * inputs.cleans,
    priceCents,
    priceOverridden,
    marginBps: margin,
    belowFloor: margin < rules.marginFloorBps,
    belowTarget: margin < target,
  };
}

/** "Bid 12" style label used on screens and the printout. */
export const bidNumberLabel = (n: number): string => `Bid ${n}`;
