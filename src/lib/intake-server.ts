import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeEmail, normalizeUsPhone } from "@/lib/leads";
import {
  CONSENT_VERSION,
  CONSENT_WORDING,
  HONEYPOT_FIELD,
  MIN_FILL_MS,
  intakeSchema,
  replyExpectation,
  splitName,
  type IntakeResponse,
} from "@/lib/intake";

// The server half of the public lead form. Every rule that matters is enforced here, in the
// order that keeps the expensive and the revealing steps last: size and shape, bot traps,
// per-address rate limit, Turnstile, per-person rate limit, then the database.
// Nothing here tells a visitor whether a phone or email is already on file.

export const MAX_BODY_BYTES = 8_000;
const IP_LIMIT = { limit: 6, windowSeconds: 600 };
const PERSON_LIMIT = { limit: 3, windowSeconds: 3600 };
const GLOBAL_LIMIT = { limit: 300, windowSeconds: 3600 };

export type IntakeDeps = {
  db: Pick<SupabaseClient<Database>, "rpc">;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => Date;
};

export type IntakeResult = { status: number; body: IntakeResponse; headers?: Record<string, string> };

const siteverifySchema = z.object({ success: z.boolean(), "error-codes": z.array(z.string()).optional() });

/** First hop of the forwarded chain; Vercel sets it, and a missing one still rate-limits as "unknown". */
export function clientIp(headers: Pick<Headers, "get">): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown";
}

/** Keyed hash, so rate-limit rows and stored consent evidence never hold a raw address, phone or email. */
export function hashKey(salt: string, value: string): string {
  return createHmac("sha256", salt).update(value).digest("hex");
}

const isLocal = (url: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url);

async function verifyTurnstile(deps: IntakeDeps, token: string | undefined, ip: string): Promise<"ok" | "failed" | "unavailable"> {
  const secret = deps.env.TURNSTILE_SECRET_KEY;
  if (!secret) return deps.env.NODE_ENV === "production" ? "unavailable" : "ok"; // closed in production, open on a dev machine
  if (!token) return "failed";
  // The override exists for tests and is ignored unless it points at this machine.
  const override = deps.env.TURNSTILE_VERIFY_URL;
  const url = override && isLocal(override) ? override : "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  try {
    const res = await deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "unavailable";
    const parsed = siteverifySchema.safeParse(await res.json());
    if (!parsed.success) return "unavailable";
    return parsed.data.success ? "ok" : "failed";
  } catch {
    return "unavailable";
  }
}

async function withinLimit(deps: IntakeDeps, key: string, rule: { limit: number; windowSeconds: number }): Promise<boolean | "error"> {
  const { data, error } = await deps.db.rpc("intake_rate_hit", { p_key: key, p_limit: rule.limit, p_window_seconds: rule.windowSeconds });
  if (error || typeof data !== "boolean") return "error";
  return data;
}

const limited = (windowSeconds: number): IntakeResult => ({
  status: 429,
  body: { ok: false, error: "rate_limited", message: "That's a lot of requests. Please try again in a little while, or call us." },
  headers: { "retry-after": String(windowSeconds) },
});
const unavailable: IntakeResult = { status: 503, body: { ok: false, error: "unavailable", message: "The form is unavailable right now. Please call us instead." } };

/** `rawBody` is the request text, read once; `headers` supplies the content type and client address. */
export async function handleIntake(deps: IntakeDeps, rawBody: string, headers: Pick<Headers, "get">): Promise<IntakeResult> {
  const salt = deps.env.INTAKE_IP_SALT;
  if (!salt || salt.length < 16) return unavailable; // refuse to run with an unsalted hash

  if (!(headers.get("content-type") ?? "").toLowerCase().includes("application/json") || Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return { status: 400, body: { ok: false, error: "invalid", message: "Something was wrong with that request." } };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: "invalid", message: "Something was wrong with that request." } };
  }
  const parsed = intakeSchema.safeParse(json);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    return {
      status: 400,
      body: { ok: false, error: "invalid", message: parsed.error.issues[0]?.message ?? "Please check the form.", fields: flat.fieldErrors },
    };
  }
  const v = parsed.data;
  const ip = clientIp(headers);
  const ipHash = hashKey(salt, `ip:${ip}`);
  const reply = replyExpectation(deps.now());
  const thanks: IntakeResult = { status: 200, body: { ok: true, message: reply.message } };

  // Every attempt counts against the address, including the ones a bot trap swallows below.
  const ipOk = await withinLimit(deps, `ip:${ipHash}`, IP_LIMIT);
  if (ipOk === "error") return { status: 500, body: { ok: false, error: "server", message: "Something went wrong. Please try again." } };
  if (!ipOk) return limited(IP_LIMIT.windowSeconds);

  // A filled hidden field or an instant submit is a bot: answer like a success so it learns nothing.
  if ((v[HONEYPOT_FIELD] ?? "") !== "" || (v.elapsedMs !== undefined && v.elapsedMs < MIN_FILL_MS)) return thanks;

  const human = await verifyTurnstile(deps, v.turnstileToken, ip);
  if (human === "unavailable") return unavailable;
  if (human === "failed") {
    return { status: 403, body: { ok: false, error: "captcha", message: "We couldn't confirm you're not a robot. Please try again." } };
  }

  const phone = v.phone ? normalizeUsPhone(v.phone) : null;
  const email = v.email ? normalizeEmail(v.email) : null;
  const person = await withinLimit(deps, `p:${hashKey(salt, `person:${phone ?? email}`)}`, PERSON_LIMIT);
  if (person === "error") return { status: 500, body: { ok: false, error: "server", message: "Something went wrong. Please try again." } };
  if (!person) return limited(PERSON_LIMIT.windowSeconds);
  const all = await withinLimit(deps, "global", GLOBAL_LIMIT);
  if (all === "error") return { status: 500, body: { ok: false, error: "server", message: "Something went wrong. Please try again." } };
  if (!all) return unavailable;

  // The wording on file is the server's copy for the version shown; a stale page is told to reload.
  if (v.consent && v.consentVersion !== CONSENT_VERSION) {
    return { status: 400, body: { ok: false, error: "invalid", message: "This page is out of date. Please reload it and try again." } };
  }

  const { first, last } = splitName(v.name);
  const { error } = await deps.db.rpc("intake_lead", {
    p_first_name: first,
    p_last_name: last as string,
    p_phone: phone as string,
    p_email: email as string,
    p_service_type: v.serviceType,
    p_borough: v.borough,
    p_utm: v.utm,
    p_page: v.page as string,
    p_consent: v.consent,
    p_consent_wording: v.consent ? CONSENT_WORDING : (null as unknown as string),
    p_consent_version: v.consent ? CONSENT_VERSION : (null as unknown as string),
    p_ip_hash: ipHash,
  });
  if (error) {
    if (error.code === "KC005") return { status: 400, body: { ok: false, error: "invalid", message: error.message } };
    console.error("intake_lead failed", error.code ?? "unknown"); // the code only: no names, phones or emails in logs
    return { status: 500, body: { ok: false, error: "server", message: "Something went wrong. Please try again." } };
  }
  return thanks;
}
