import { timingSafeEqual } from "node:crypto";
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
