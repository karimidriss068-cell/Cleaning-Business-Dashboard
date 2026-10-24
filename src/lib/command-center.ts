import { addDays, nyDateString } from "@/lib/format";

/** The NY calendar days from `from` through `to`, inclusive. */
export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * One value per NY day: sums `value(item)` (or counts) for items whose
 * instant falls on that day. Instants are bucketed in New York, not UTC.
 */
export function dailySeries<T>(
  items: T[],
  instant: (item: T) => string,
  days: string[],
  value: (item: T) => number = () => 1,
): number[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const item of items) {
    const i = index.get(nyDateString(instant(item)));
    if (i !== undefined) out[i] += value(item);
  }
  return out;
}

/** Running total of a series (for month-to-date sparklines). */
export function cumulative(series: number[]): number[] {
  let total = 0;
  return series.map((v) => (total += v));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Signed whole-number change, e.g. "+3", "−2", "±0" (true minus sign). */
export function signedCount(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

/** Signed percent change from `before` to `after`; null when before is 0. */
export function signedPercent(before: number, after: number): string | null {
  if (before === 0) return null;
  const pct = Math.round(((after - before) / before) * 100);
  if (pct === 0) return "±0%";
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

export function direction(delta: number): "up" | "down" | "flat" {
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

/** Minutes between two instants, rounded. */
export function minutesBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}

/** "9m", "2h 5m", "3d" for response times and ages. */
export function shortDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.floor(minutes / (60 * 24))}d`;
}
