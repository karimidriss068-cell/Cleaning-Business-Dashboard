import { z } from "zod";
import { BOROUGHS, normalizeEmail, normalizeUsPhone } from "@/lib/leads";
import { SHOWN_SERVICE_TYPES } from "@/config/business";

// Shared by the public form (browser) and POST /api/public/leads (server): the contract,
// the consent wording and the reply promise live in one place so they can't drift apart.

/** Bump the version whenever the wording changes; the server stores the text it holds for that version. */
export const CONSENT_VERSION = "2026-11-a";
export const CONSENT_WORDING =
  "I agree to receive text messages from Keystone Clean about my cleaning request, such as replies, booking confirmations and reminders. Message frequency varies and message and data rates may apply. Consent is not a condition of any purchase. Reply STOP to opt out at any time.";

export const REPLY_WITHIN_MINUTES = 15;
/** Same window as automated texts: the office answers between these New York hours. */
export const OFFICE_OPEN_HOUR = 8;
export const OFFICE_CLOSE_HOUR = 21;

export const HONEYPOT_FIELD = "website";
/** A person can't fill this form in under about a second and a half. */
export const MIN_FILL_MS = 1500;

const shortText = (max: number) =>
  z
    .string()
    .max(max)
    // Control characters have no place in a campaign tag or a page address.
    .transform((v) => v.replace(/[\u0000-\u001f\u007f]/g, "").trim())
    .optional();

export const utmSchema = z
  .object({
    source: shortText(120),
    medium: shortText(120),
    campaign: shortText(200),
    term: shortText(200),
    content: shortText(200),
  })
  .strict();

export const intakeSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Please tell us your name")
      .max(120, "That name is too long")
      .refine((v) => !/https?:|www\./i.test(v), "Please enter your name, not a link"),
    // Checked per field (not in superRefine) so every bad field is reported at once.
    phone: z.string().trim().max(30).refine((v) => normalizeUsPhone(v) !== null, "That isn't a valid US phone number").optional(),
    email: z.string().trim().max(254).refine((v) => z.string().email().safeParse(normalizeEmail(v)).success, "That email address isn't valid").optional(),
    borough: z.enum(BOROUGHS, { message: "Choose your borough" }),
    serviceType: z.enum(SHOWN_SERVICE_TYPES, { message: "This form is for commercial cleaning bids" }),
    consent: z.boolean(),
    consentVersion: z.string().max(40).optional(),
    page: z
      .string()
      .max(300)
      .regex(/^https?:\/\//i, "Page must be a web address")
      .optional(),
    utm: utmSchema.default({}),
    // Bot traps: humans never fill the hidden field and take a moment to type.
    [HONEYPOT_FIELD]: z.string().max(200).optional(),
    elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
    turnstileToken: z.string().max(2048).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.phone && !v.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "Add a phone number or an email" });
    if (v.consent && !v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Add your mobile number so we can text you" });
  });
export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakeData = z.output<typeof intakeSchema>;

/** "Maria Del Rio" becomes first "Maria", last "Del Rio". */
export function splitName(full: string): { first: string; last: string | null } {
  const parts = full.trim().split(/\s+/);
  const first = (parts.shift() ?? "").slice(0, 80);
  const last = parts.join(" ").slice(0, 80);
  return { first, last: last || null };
}

/** When a person who just sent the form can expect a reply, from New York time. */
export function replyExpectation(now: Date): { kind: "now" | "morning"; message: string } {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour >= OFFICE_OPEN_HOUR && hour < OFFICE_CLOSE_HOUR) {
    return { kind: "now", message: `We'll reach out within ${REPLY_WITHIN_MINUTES} minutes.` };
  }
  return { kind: "morning", message: `Our office is closed right now. We'll reach out by ${OFFICE_OPEN_HOUR}am ${hour < OFFICE_OPEN_HOUR ? "this morning" : "tomorrow"}.` };
}

export type IntakeResponse =
  | { ok: true; message: string }
  | { ok: false; error: "invalid" | "captcha" | "rate_limited" | "unavailable" | "server"; message: string; fields?: Record<string, string[] | undefined> };
