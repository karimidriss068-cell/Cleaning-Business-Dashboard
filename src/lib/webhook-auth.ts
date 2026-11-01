import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Timing-safe comparison of a request header against an expected secret. A
 * plain `!==` string compare short-circuits on the first differing byte,
 * leaking how much of the secret an attacker guessed correctly;
 * timingSafeEqual takes constant time regardless of where the mismatch occurs.
 */
function verifySecretHeader(
  req: NextRequest,
  headerName: string,
  expected: string | undefined,
): boolean {
  const provided = req.headers.get(headerName);
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  // timingSafeEqual throws on mismatched lengths — guard first so a
  // wrong-length guess still returns false instead of crashing the route.
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

/** Verifies the `x-webhook-secret` header against N8N_WEBHOOK_SECRET. */
export function verifyWebhookSecret(req: NextRequest): boolean {
  return verifySecretHeader(req, "x-webhook-secret", process.env.N8N_WEBHOOK_SECRET);
}

/** Verifies the `x-retell-secret` header against RETELL_WEBHOOK_SECRET. */
export function verifyRetellSecret(req: NextRequest): boolean {
  return verifySecretHeader(req, "x-retell-secret", process.env.RETELL_WEBHOOK_SECRET);
}

/**
 * Verifies Vercel Cron's own auth contract: an `authorization: Bearer
 * $CRON_SECRET` header, automatically sent on every cron-triggered request
 * once CRON_SECRET is set as a project env var (Vercel docs:
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 * Distinct from verifyWebhookSecret's `x-webhook-secret` header — a route
 * that's triggered by both Vercel Cron and n8n/manual calls should check
 * both rather than replacing one with the other.
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return verifySecretHeader(req, "authorization", secret ? `Bearer ${secret}` : undefined);
}

/**
 * Verifies Stripe's `Stripe-Signature` header (https://docs.stripe.com/webhooks#verify-manually):
 * `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">[,v1=...]`. Compared with
 * timingSafeEqual, and a timestamp more than five minutes from now is rejected
 * so a captured request can't be replayed later. Pass the raw, unparsed body.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowMs: number = Date.now(),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    return timingSafeEqual(expected, Buffer.from(sig, "hex"));
  });
}

/**
 * Verifies `authorization: Bearer $GROWTH_API_KEY` for the read-only growth
 * snapshot that Roast Room, Agents and the voice AI poll. The key can read
 * the numbers and nothing else.
 */
export function verifyGrowthKey(req: NextRequest): boolean {
  const key = process.env.GROWTH_API_KEY;
  return verifySecretHeader(req, "authorization", key ? `Bearer ${key}` : undefined);
}
