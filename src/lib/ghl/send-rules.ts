import { addDays, nyWallClock, nyWallTimeToUtc } from "@/lib/format";

// One copy of the rules for automated texts, as pure functions so they can be
// tested without a clock, a database or GHL. The database re-checks consent and
// opt-outs when a text is claimed; quiet hours, rate limits and dry-run live here.

export const TEMPLATE_KEYS = ["instant_reply", "booking_confirmation", "reminder_24h", "review_request", "payment_link"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Texts go out from 8:00 up to (not including) 21:00 New York time. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

export function nyHour(now: Date): number {
  return Number(nyWallClock(now).time.slice(0, 2));
}

export function isQuietHours(now: Date): boolean {
  const h = nyHour(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** Now if texting is allowed, else the next 8:00 New York (DST-safe). */
export function nextSendTime(now: Date): Date {
  if (!isQuietHours(now)) return now;
  const wall = nyWallClock(now);
  const date = nyHour(now) >= QUIET_START_HOUR ? addDays(wall.date, 1) : wall.date;
  return nyWallTimeToUtc(date, "08:00");
}

/** Messages in GHL that are a STOP request (the whole message, ignoring case and punctuation). */
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout"]);
export function isStopKeyword(body: string): boolean {
  return STOP_WORDS.has(body.toLowerCase().replace(/[^a-z]/g, ""));
}

export type SendLimits = { perContactPerDay: number; perHour: number };
export type SendCounts = { contactDay: number; hour: number };
export type SendDecision =
  | { action: "send" }
  | { action: "wait"; reason: "quiet_hours" | "rate_limit"; until: Date | null };

/**
 * Whether a due text can go now. Consent and opt-out are not decided here: the
 * database claim refuses them and records why. Waiting leaves no log row, so the
 * next run asks again; dry-run follows the same rules so the log shows what a
 * live run would do.
 */
export function decideSend(now: Date, counts: SendCounts, limits: SendLimits): SendDecision {
  if (isQuietHours(now)) return { action: "wait", reason: "quiet_hours", until: nextSendTime(now) };
  if (counts.contactDay >= limits.perContactPerDay || counts.hour >= limits.perHour) {
    return { action: "wait", reason: "rate_limit", until: null };
  }
  return { action: "send" };
}

/** Fills {{name}} placeholders; an unknown placeholder is left out rather than shown. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "").replace(/\s{2,}/g, " ").trim();
}

/** The variables a template can use, from a due message and the settings. */
export function templateVars(input: { firstName: string; business: string; eventAt: Date | null; payLink: string | null }): Record<string, string> {
  const when = input.eventAt
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(input.eventAt)
    : "";
  return { first_name: input.firstName || "there", business: input.business, when, pay_link: input.payLink ?? "" };
}
