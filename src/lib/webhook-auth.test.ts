import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { verifyGhlSecret, verifyGrowthKey, verifyStripeSignature } from "./webhook-auth";

const secret = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = Date.UTC(2026, 10, 1, 15, 0, 0);
const t = Math.floor(now / 1000);
const sign = (payload: string, ts: number, key = secret) => createHmac("sha256", key).update(`${ts}.${payload}`).digest("hex");

describe("verifyStripeSignature", () => {
  it("accepts a valid signature", () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t)}`, secret, now)).toBe(true);
  });
  it("accepts when any one of several v1 signatures matches", () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)},v1=${sign(body, t)}`, secret, now)).toBe(true);
  });
  it("rejects a bad signature, a tampered body and the wrong secret", () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${"a".repeat(64)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body + " ", `t=${t},v1=${sign(body, t)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t, "other")}`, secret, now)).toBe(false);
  });
  it("rejects a timestamp more than five minutes old or in the future", () => {
    const old = t - 301;
    expect(verifyStripeSignature(body, `t=${old},v1=${sign(body, old)}`, secret, now)).toBe(false);
    const ahead = t + 301;
    expect(verifyStripeSignature(body, `t=${ahead},v1=${sign(body, ahead)}`, secret, now)).toBe(false);
    const edge = t - 299;
    expect(verifyStripeSignature(body, `t=${edge},v1=${sign(body, edge)}`, secret, now)).toBe(true);
  });
  it("rejects missing or malformed input", () => {
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t)}`, undefined, now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=abc,v1=${sign(body, t)}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=not-hex`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t}`, secret, now)).toBe(false);
  });
});

describe("verifyGrowthKey", () => {
  const req = (authorization?: string) => ({ headers: new Headers(authorization ? { authorization } : {}) }) as unknown as NextRequest;
  it("accepts only the exact bearer key", () => {
    process.env.GROWTH_API_KEY = "k-123";
    expect(verifyGrowthKey(req("Bearer k-123"))).toBe(true);
    expect(verifyGrowthKey(req("Bearer k-124"))).toBe(false);
    expect(verifyGrowthKey(req("Bearer k-12"))).toBe(false);
    expect(verifyGrowthKey(req("k-123"))).toBe(false);
    expect(verifyGrowthKey(req())).toBe(false);
  });
  it("rejects everything when no key is configured", () => {
    delete process.env.GROWTH_API_KEY;
    expect(verifyGrowthKey(req("Bearer "))).toBe(false);
    expect(verifyGrowthKey(req("Bearer undefined"))).toBe(false);
  });
});

describe("verifyGhlSecret", () => {
  const long = "a1b2c3d4".repeat(8); // 64 characters
  const req = (value: string | null) => ({ headers: new Headers(value === null ? {} : { "x-ghl-webhook-secret": value }) }) as unknown as NextRequest;
  const withEnv = (value: string | undefined, run: () => void) => {
    const before = process.env.GHL_WEBHOOK_SECRET;
    if (value === undefined) delete process.env.GHL_WEBHOOK_SECRET;
    else process.env.GHL_WEBHOOK_SECRET = value;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.GHL_WEBHOOK_SECRET;
      else process.env.GHL_WEBHOOK_SECRET = before;
    }
  };
  it("accepts the right secret", () => withEnv(long, () => expect(verifyGhlSecret(req(long))).toBe(true)));
  it("rejects a wrong, same-length, missing or empty header", () =>
    withEnv(long, () => {
      expect(verifyGhlSecret(req("b".repeat(64)))).toBe(false);
      expect(verifyGhlSecret(req(long.slice(0, 63)))).toBe(false);
      expect(verifyGhlSecret(req(""))).toBe(false);
      expect(verifyGhlSecret(req(null))).toBe(false);
    }));
  it("treats a missing or short configured secret as not configured, even if the header matches", () => {
    withEnv(undefined, () => expect(verifyGhlSecret(req("anything")).valueOf()).toBe(false));
    withEnv("short-secret", () => expect(verifyGhlSecret(req("short-secret"))).toBe(false));
  });
});
