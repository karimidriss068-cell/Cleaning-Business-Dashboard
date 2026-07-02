const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US");

/** Format a numeric value as USD. Null/undefined renders as an em dash. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return currencyFormatter.format(value);
}

/** Format an integer with thousands separators. Null renders as em dash. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numberFormatter.format(value);
}

/** Cost-per-X: spend / count. Guards divide-by-zero, returns em dash. */
export function perUnit(
  spend: number | null | undefined,
  count: number | null | undefined,
): string {
  if (!count || !spend) return "—";
  return money(spend / count);
}

/** Format a 0..1 ratio as a whole-number percent, e.g. 0.42 -> "42%". */
export function pct(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

/** Format a duration in hours as "3.2h" (<48h) or "2.1d" otherwise. */
export function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return "—";
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/** Format an ISO date/timestamp string as e.g. "Jul 1, 2026". */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * ISO date (YYYY-MM-DD) for Monday 00:00 of the current week, plus "now".
 * Used for the dashboard's "this week" rollups.
 */
export function currentWeekRange(): { weekStart: string; nowIso: string } {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun ... 6 = Sat
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return {
    weekStart: monday.toISOString().slice(0, 10),
    nowIso: now.toISOString(),
  };
}
