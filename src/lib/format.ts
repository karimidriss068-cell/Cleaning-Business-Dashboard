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

/**
 * Format an ISO date/timestamp string as e.g. "Jul 1, 2026".
 * @deprecated Uses the machine's local time zone. Use formatNyDate for
 * timestamps or formatCalendarDate for date-only values.
 */
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
 * @deprecated Uses the machine's local time zone. Use nyWeekStart(nyToday()).
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

// ---------------------------------------------------------------------------
// Money in integer cents (CLAUDE.md rule 4). No floating-point math: amounts
// are split into whole dollars and cents with integer arithmetic.
// ---------------------------------------------------------------------------

/**
 * Format integer cents as USD, e.g. 123456 -> "$1,234.56", -250 -> "-$2.50".
 * Null renders as an em dash. Throws on non-integers so a dollar amount
 * passed by mistake fails loudly instead of rendering 100x too small.
 */
export function formatCents(
  cents: number | null | undefined,
  options: { hideZeroCents?: boolean } = {},
): string {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`formatCents expects integer cents, got ${cents}`);
  }
  const abs = Math.abs(cents);
  const dollars = numberFormatter.format(Math.trunc(abs / 100));
  const rem = abs % 100;
  const body = options.hideZeroCents && rem === 0 ? `$${dollars}` : `$${dollars}.${String(rem).padStart(2, "0")}`;
  return cents < 0 ? `-${body}` : body;
}

const DOLLARS_PATTERN = /^\s*(-)?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*$/;

/**
 * Parse user-typed dollars into integer cents: "$1,234.5" -> 123450,
 * "0.29" -> 29, "-3.10" -> -310. Returns null for anything that isn't a
 * plain dollar amount with at most two decimals.
 */
export function parseDollarsToCents(input: string): number | null {
  const m = DOLLARS_PATTERN.exec(input);
  if (!m) return null;
  const dollars = Number(m[2].replace(/,/g, ""));
  const cents = Number((m[3] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  if (!Number.isSafeInteger(total)) return null;
  return m[1] ? -total : total;
}

/**
 * bps basis points of an amount in cents, rounded half up. Matches the
 * database's pay calculation: (cents * bps + 5000) / 10000.
 */
export function percentOfCents(cents: number, bps: number): number {
  if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(bps) || cents < 0 || bps < 0) {
    throw new RangeError(`percentOfCents expects non-negative integers, got ${cents}, ${bps}`);
  }
  return Math.floor((cents * bps + 5000) / 10000);
}

// ---------------------------------------------------------------------------
// Time: stored as UTC, shown and reasoned about in America/New_York
// (CLAUDE.md rule 5). Never depends on the server's or browser's time zone.
// "Date" strings below are NY calendar dates in YYYY-MM-DD form.
// ---------------------------------------------------------------------------

export const BUSINESS_TIME_ZONE = "America/New_York";

type Instant = Date | string;

function toDate(value: Instant | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const nyPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The NY wall-clock date ("YYYY-MM-DD") and time ("HH:MM") of an instant. */
export function nyWallClock(value: Instant): { date: string; time: string } {
  const d = toDate(value);
  if (!d) throw new RangeError(`invalid instant: ${String(value)}`);
  const p = Object.fromEntries(nyPartsFormatter.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** The NY calendar date of an instant, e.g. 2026-11-04T03:30Z -> "2026-11-03". */
export function nyDateString(value: Instant): string {
  return nyWallClock(value).date;
}

/** Today's date in New York. */
export function nyToday(now: Date = new Date()): string {
  return nyDateString(now);
}

function parseDate(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`expected YYYY-MM-DD, got ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Calendar arithmetic on a YYYY-MM-DD date (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday of the week containing a NY calendar date. */
export function nyWeekStart(date: string): string {
  const [y, m, d] = parseDate(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

function nyOffsetMinutes(utcMs: number): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(utcMs))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/**
 * Convert a NY wall-clock date + time to the UTC instant, DST-safe.
 * - Fall-back overlap (1:00-1:59 happens twice): returns the first
 *   occurrence (EDT).
 * - Spring-forward gap (2:00-2:59 doesn't exist): shifts forward by the gap,
 *   so 2:30 becomes 3:30 EDT.
 */
export function nyWallTimeToUtc(date: string, time: string): Date {
  const [y, mo, d] = parseDate(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!tm) throw new RangeError(`expected HH:MM, got ${time}`);
  const asUtc = Date.UTC(y, mo - 1, d, Number(tm[1]), Number(tm[2]));
  // The two offsets in effect around this wall time (equal on normal days).
  const offsets = [...new Set([nyOffsetMinutes(asUtc - 12 * 3600000), nyOffsetMinutes(asUtc + 12 * 3600000)])];
  const matches = offsets
    .map((off) => asUtc - off * 60000)
    .filter((utc) => {
      const wall = nyWallClock(new Date(utc));
      return wall.date === date && wall.time === time;
    });
  if (matches.length > 0) return new Date(Math.min(...matches));
  // In the gap: interpret with the offset from before the transition.
  return new Date(asUtc - nyOffsetMinutes(asUtc - 12 * 3600000) * 60000);
}

/**
 * The UTC range [start, end) covering one NY calendar day. 23 hours on the
 * spring-forward day, 25 on the fall-back day. Use for "today's jobs" queries.
 */
export function nyDayRangeUtc(date: string): { start: Date; end: Date } {
  return { start: nyWallTimeToUtc(date, "00:00"), end: nyWallTimeToUtc(addDays(date, 1), "00:00") };
}

// Some ICU versions put a narrow no-break space before AM/PM; normalize it.
const clean = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

const nyDateFormatters = {
  short: new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, month: "short", day: "numeric", year: "numeric" }),
  weekday: new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, weekday: "short", month: "short", day: "numeric" }),
};
const nyTimeFormatter = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** An instant's NY date: "Nov 3, 2026" (short) or "Tue, Nov 3" (weekday). */
export function formatNyDate(value: Instant | null | undefined, style: keyof typeof nyDateFormatters = "short"): string {
  const d = toDate(value);
  return d ? clean(nyDateFormatters[style].format(d)) : "—";
}

/** An instant's NY time, e.g. "9:00 AM". */
export function formatNyTime(value: Instant | null | undefined): string {
  const d = toDate(value);
  return d ? clean(nyTimeFormatter.format(d)) : "—";
}

/** An instant's NY date and time, e.g. "Tue, Nov 3, 9:00 AM". */
export function formatNyDateTime(value: Instant | null | undefined): string {
  const d = toDate(value);
  return d ? `${formatNyDate(d, "weekday")}, ${formatNyTime(d)}` : "—";
}

const calendarDateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/**
 * A date-only value (a Postgres `date`, e.g. due_on) as "Nov 3, 2026".
 * Formatted without any time zone shift: new Date("2026-11-03") is UTC
 * midnight, which in New York would wrongly read as Nov 2.
 */
export function formatCalendarDate(date: string | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = parseDate(date);
  return clean(calendarDateFormatter.format(new Date(Date.UTC(y, m - 1, d))));
}
