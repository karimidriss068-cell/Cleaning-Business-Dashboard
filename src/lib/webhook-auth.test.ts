import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeSignature } from "./webhook-auth";

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
