import { describe, expect, it, vi } from "vitest";
import { createGhlClient, GhlError, ghlConfig } from "./client";

const cfg = { token: "tok_fake_123", locationId: "loc_test" };
const reply = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status }));

describe("ghlConfig", () => {
  it("needs both the token and the location", () => {
    const before = { ...process.env };
    process.env.GHL_API_TOKEN = "t";
    delete process.env.GHL_LOCATION_ID;
    expect(ghlConfig()).toBeNull();
    process.env.GHL_LOCATION_ID = "l";
    expect(ghlConfig()).toEqual({ token: "t", locationId: "l" });
    process.env = before;
  });
});

describe("GHL client", () => {
  it("sends the bearer token and version header and parses the contact", async () => {
    const f = reply(200, { contact: { id: "c1", firstName: "Dana", tags: ["sms-consent"] } });
    const c = await createGhlClient(cfg, f).getContact("c 1");
    expect(c?.id).toBe("c1");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/c%201");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok_fake_123", Version: "2021-07-28" });
  });
  it("a 404 is null, not an error", async () => {
    expect(await createGhlClient(cfg, reply(404, {})).getContact("gone")).toBeNull();
  });
  it("errors carry the status but never the body or the token", async () => {
    const err = await createGhlClient(cfg, reply(500, { secret: "Dana 718-555-0142" })).getContact("c1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GhlError);
    expect((err as GhlError).message).toBe("GHL answered 500");
    expect((err as GhlError).message).not.toContain("tok_fake");
    expect((err as GhlError).retryable).toBe(true);
  });
  it("401, 403 and 422 are not worth retrying; 429 and a network failure are", async () => {
    for (const s of [401, 403, 422]) expect(((await createGhlClient(cfg, reply(s, {})).getContact("x").catch((e: unknown) => e)) as GhlError).retryable).toBe(false);
    expect(((await createGhlClient(cfg, reply(429, {})).getContact("x").catch((e: unknown) => e)) as GhlError).retryable).toBe(true);
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(((await createGhlClient(cfg, down).getContact("x").catch((e: unknown) => e)) as GhlError).retryable).toBe(true);
  });
  it("sends a text through conversations and returns the message id", async () => {
    const f = reply(200, { messageId: "m-9", conversationId: "cv" });
    expect(await createGhlClient(cfg, f).sendSms("c1", "hello")).toEqual({ messageId: "m-9" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://services.leadconnectorhq.com/conversations/messages");
    expect(JSON.parse(String(init.body))).toEqual({ type: "SMS", contactId: "c1", message: "hello" });
  });
  it("refuses a send that comes back without a message id", async () => {
    await expect(createGhlClient(cfg, reply(200, {})).sendSms("c1", "hi")).rejects.toThrow(/message id/);
  });
  it("updates an opportunity with PUT", async () => {
    const f = reply(200, {});
    await createGhlClient(cfg, f).updateOpportunity("o1", { pipelineStageId: "s1", status: "open" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/opportunities/o1");
    expect(init.method).toBe("PUT");
  });
  it("lists recent contacts newer than the cutoff", async () => {
    const f = reply(200, { contacts: [{ id: "new", dateUpdated: "2026-11-04T14:00:00Z" }, { id: "old", dateUpdated: "2026-01-01T00:00:00Z" }] });
    const rows = await createGhlClient(cfg, f).recentContacts(new Date("2026-11-04T00:00:00Z"), 50);
    expect(rows.map((r) => r.id)).toEqual(["new"]);
  });
});
