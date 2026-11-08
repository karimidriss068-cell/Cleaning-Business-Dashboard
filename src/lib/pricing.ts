// Small conversions for the pricing form: the screen shows dollars and percentages, the database keeps
// integer cents and basis points. Pure, so they are tested.

import { parseDollarsToCents } from "@/lib/format";

/** 7500 cents -> "75", 7550 -> "75.50". */
export const centsToDollarInput = (cents: number): string => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** 2550 bps -> "25.5", 3000 -> "30". */
export const bpsToPercentInput = (bps: number): string => String(bps / 100);

/** "25.5" -> 2550, "" or a non-number -> null. At most two decimals, so a percent is always whole bps. */
export function percentInputToBps(text: string): number | null {
  const t = text.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Dollars typed by a person to integer cents; null when it isn't an amount. */
export const dollarInputToCents = (text: string): number | null => {
  const c = parseDollarsToCents(text);
  return c !== null && c >= 0 ? c : null;
};

/** A rate per 1,000 sq ft in cents, shown as dollars per sq ft: 30000 -> "0.30". */
export const ratePerSqftLabel = (ratePerKsqftCents: number): string => `$${(ratePerKsqftCents / 100000).toFixed(2)}`;
