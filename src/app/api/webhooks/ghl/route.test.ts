import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb } from "@/lib/ghl/fake";
import { GhlError } from "@/lib/ghl/client";

const handle = vi.fn();
const outbound = vi.fn();
let current = fakeDb();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => current.db }));
vi.mock("@/lib/ghl/sync", () => ({ handleNotification: (...a: unknown[]) => handle(...a), runOutbound: (...a: unknown[]) => outbound(...a) }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void fn() }));

import { POST } from "./route";

const SECRET = "f".repeat(64);
const now = () => new Date().toISOString();
const body = (over: object = {}) => ({ event: "contact", eventId: `evt-${Math.random().toString(36).slice(2, 12)}`, sentAt: now(), contactId: "ghl-c-1", ...over });
const post = (payload: unknown, headers: Record<string, string> = { "x-ghl-webhook-secret": SECRET }, raw?: string) =>
  POST(new NextRequest("http://localhost/api/webhooks/ghl", { method: "POST", headers, body: raw ?? JSON.stringify(payload) }));

beforeEach(() => {
  process.env.GHL_WEBHOOK_SECRET = SECRET;
  process.env.GHL_API_TOKEN = "fake-token";
  process.env.GHL_LOCATION_ID = "loc_test";
  handle.mockReset().mockResolvedValue({ handled: "lead updated" });
  outbound.mockReset().mockResolvedValue({});
  current = fakeDb();
});

describe("POST /api/webhooks/ghl", () => {
  it("rejects a missing or wrong secret before reading anything", async () => {
    expect((await post(body(), {})).status).toBe(401);
    expect((await post(body(), { "x-ghl-webhook-secret": "e".repeat(64) })).status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
    expect(current.log.inserts).toHaveLength(0);
  });
  it("rejects when the secret is too short to trust", async () => {
    process.env.GHL_WEBHOOK_SECRET = "short";
    expect((await post(body(), { "x-ghl-webhook-secret": "short" })).status).toBe(401);
  });
  it("answers 503 when GHL isn't configured, without claiming the event", async () => {
    delete process.env.GHL_API_TOKEN;
    expect((await post(body())).status).toBe(503);
    expect(current.log.inserts).toHaveLength(0);
  });
  it("rejects bad JSON, a bad shape and a body that is too large", async () => {
    expect((await post(null, undefined, "{nope")).status).toBe(400);
    const bad = await post({ event: "contact", eventId: "evt-12345678", sentAt: now() });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toHaveProperty("issues");
    expect((await post(null, undefined, JSON.stringify({ pad: "x".repeat(11_000) }))).status).toBe(413);
  });
  it("rejects an old or future timestamp (replay window) and another location", async () => {
    expect((await post(body({ sentAt: new Date(Date.now() - 6 * 60_000).toISOString() }))).status).toBe(400);
    expect((await post(body({ sentAt: new Date(Date.now() + 6 * 60_000).toISOString() }))).status).toBe(400);
    expect((await post(body({ locationId: "someone_else" }))).status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });
  it("claims the event, processes it, and marks it processed", async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: "lead updated" });
    expect(current.log.inserts[0]).toMatchObject({ table: "webhook_events", row: { provider: "ghl" } });
    expect(current.log.updates.at(-1)).toMatchObject({ table: "webhook_events", patch: { status: "processed" } });
    expect(current.calls("ghl_touch")[0]?.args).toMatchObject({ p_what: "webhook" });
  });
  it("answers a repeated event id with duplicate:true and does not process again", async () => {
    current = fakeDb({ insertError: { webhook_events: { code: "23505", message: "duplicate" } } });
    const res = await post(body());
    expect(await res.json()).toEqual({ duplicate: true });
    expect(handle).not.toHaveBeenCalled();
  });
  it("sends what is due at once when the event created a lead", async () => {
    handle.mockResolvedValue({ handled: "lead created", createdLead: true });
    await post(body());
    expect(outbound).toHaveBeenCalledTimes(1);
  });
  it("does not run the outbound pass for an ordinary event", async () => {
    await post(body());
    expect(outbound).not.toHaveBeenCalled();
  });
  it("500 and 'failed' when processing throws, so GHL retries", async () => {
    handle.mockRejectedValue(new Error("db down"));
    const res = await post(body());
    expect(res.status).toBe(500);
    expect(current.log.updates.at(-1)).toMatchObject({ patch: { status: "failed", error: "db down" } });
  });
  it("a permanent GHL answer is 422 (no retry), a transient one is 500", async () => {
    handle.mockRejectedValue(new GhlError("GHL answered 403", 403));
    expect((await post(body())).status).toBe(422);
    handle.mockRejectedValue(new GhlError("GHL answered 503", 503));
    expect((await post(body())).status).toBe(500);
  });
});
