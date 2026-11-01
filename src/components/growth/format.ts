import { formatCalendarDate, formatCents } from "@/lib/format";
import { monthShort } from "@/lib/payouts";

export const money = (cents: number | null) => formatCents(cents === null ? null : Math.round(cents / 100) * 100, { hideZeroCents: true });
export const moneyExact = (cents: number | null) => formatCents(cents, { hideZeroCents: true });
export const dollarInput = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** "3 days ahead of pace", "1.5 days behind pace", "right on pace". */
export function paceSentence(daysAhead: number): string {
  const abs = Math.abs(daysAhead);
  if (abs < 0.1) return "Right on pace";
  const n = `${abs} ${abs === 1 ? "day" : "days"}`;
  return daysAhead > 0 ? `${n} ahead of pace` : `${n} behind pace`;
}

export const monthLabel = (monthStart: string) => `${monthShort(monthStart)} ${monthStart.slice(0, 4)}`;
export const longDate = formatCalendarDate;
