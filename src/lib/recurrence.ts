import { addDays, nyWallTimeToUtc } from "@/lib/format";

/**
 * The RRULE subset job_series uses: FREQ=DAILY|WEEKLY|MONTHLY with INTERVAL,
 * BYDAY (weekly), BYMONTHDAY (monthly), UNTIL and WKST. Weeks start on
 * Sunday unless WKST says otherwise (the convention the series were created
 * with), so INTERVAL=2 keeps the same alternate weeks.
 */
export type Rule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byDay: number[]; // 0 = Sunday ... 6 = Saturday
  byMonthDay: number[];
  until: string | null; // YYYY-MM-DD
  weekStart: number;
};

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function parseRule(rrule: string): Rule {
  const parts = Object.fromEntries(
    rrule.replace(/^RRULE:/, "").split(";").filter(Boolean).map((p) => {
      const [k, v] = p.split("=");
      return [k, v ?? ""];
    }),
  );
  const freq = parts.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") throw new Error(`Unsupported FREQ in "${rrule}"`);
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1) throw new Error(`Bad INTERVAL in "${rrule}"`);
  const byDay = parts.BYDAY ? parts.BYDAY.split(",").map((d) => DAYS.indexOf(d)) : [];
  if (byDay.some((d) => d < 0)) throw new Error(`Bad BYDAY in "${rrule}"`);
  const byMonthDay = parts.BYMONTHDAY ? parts.BYMONTHDAY.split(",").map(Number) : [];
  const until = parts.UNTIL ? `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}` : null;
  const weekStart = parts.WKST ? DAYS.indexOf(parts.WKST) : 0;
  return { freq, interval, byDay, byMonthDay, until, weekStart: weekStart < 0 ? 0 : weekStart };
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Occurrence dates (NY calendar) of a rule anchored at `start`, within [from, to]. */
export function occurrences(rule: Rule, start: string, from: string, to: string): string[] {
  const last = rule.until && rule.until < to ? rule.until : to;
  const first = from > start ? from : start;
  const out: string[] = [];
  const startWeek = addDays(start, -((weekday(start) - rule.weekStart + 7) % 7));
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (rule.freq === "DAILY") {
      if (daysBetween(start, d) % rule.interval === 0) out.push(d);
    } else if (rule.freq === "WEEKLY") {
      const days = rule.byDay.length ? rule.byDay : [weekday(start)];
      const week = Math.floor(daysBetween(startWeek, d) / 7);
      if (week % rule.interval === 0 && days.includes(weekday(d))) out.push(d);
    } else {
      const months = (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(start.slice(5, 7));
      const days = rule.byMonthDay.length ? rule.byMonthDay : [Number(start.slice(8, 10))];
      if (months % rule.interval === 0 && days.includes(Number(d.slice(8, 10)))) out.push(d);
    }
  }
  return out;
}

export type SeriesForPlanning = {
  id: string;
  recurrence_rule: string;
  start_date: string;
  end_date: string | null;
  generated_through: string | null;
  local_start_time: string; // "HH:MM" or "HH:MM:SS"
  duration_minutes: number;
};

export const GENERATION_HORIZON_DAYS = 56;

/**
 * The visits a series needs from today through the horizon (8 weeks), each
 * with its NY wall-clock start converted to UTC (DST-safe). Starts after
 * generated_through so edits to past visits are left alone; the database's
 * unique (series_id, scheduled_start) makes reruns harmless anyway.
 */
export function planVisits(series: SeriesForPlanning, today: string, horizonDays = GENERATION_HORIZON_DAYS) {
  const horizon = addDays(today, horizonDays);
  const after = series.generated_through ? addDays(series.generated_through, 1) : series.start_date;
  const from = [today, series.start_date, after].sort().at(-1) as string;
  const to = series.end_date && series.end_date < horizon ? series.end_date : horizon;
  const time = series.local_start_time.slice(0, 5);
  const visits = from > to ? [] : occurrences(parseRule(series.recurrence_rule), series.start_date, from, to).map((date) => {
    const start = nyWallTimeToUtc(date, time);
    return { date, start, end: new Date(start.getTime() + series.duration_minutes * 60000) };
  });
  return { visits, generatedThrough: to < horizon ? to : horizon };
}
