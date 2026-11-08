import { describe, expect, it, vi } from "vitest";
import { CONSENT_VERSION, CONSENT_WORDING } from "@/lib/intake";
import { clientIp, handleIntake, hashKey, MAX_BODY_BYTES, type IntakeDeps } from "@/lib/intake-server";

const SALT = "test-salt-0123456789";
const good = { name: "Maria Del Rio", phone: "(332) 555-0101", email: "maria@example.com", borough: "queens", serviceType: "commercial", consent: true, consentVersion: CONSENT_VERSION, elapsedMs: 6000, turnstileToken: "tok" };
const jsonHeaders = (extra: Record<string, string> = {}) => new Headers({ "content-type": "application/json", "x-real-ip": "203.0.113.7", ...extra });
const noon = () => new Date("2026-11-04T17:00:00Z");

type Call = { fn: string; args: Record<string, unknown> };

/** An in-memory stand-in for the two database functions the handler uses. */
function setup(over: { env?: Record<string, string | undefined>; turnstile?: "pass" | "fail" | "down"; intakeError?: { code: string; message: string } } = {}) {
  const calls: Call[] = [];
  const hits = new Map<string, number>();
  const people = new Set<string>();
  const db = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "intake_rate_hit") {
        const key = String(args.p_key);
        const n = (hits.get(key) ?? 0) + 1;
        if (n > Number(args.p_limit)) return { data: false, error: null };
        hits.set(key, n);
        return { data: true, error: null };
      }
      if (over.intakeError) return { data: null, error: over.intakeError };
      const dup = people.has(String(args.p_phone));
      people.add(String(args.p_phone));
      return { data: { duplicate: dup }, error: null };
    }),
  };
  const fetchMock = vi.fn(async () => {
    if (over.turnstile === "down") return new Response("nope", { status: 500 });
    return Response.json({ success: over.turnstile !== "fail" });
  });
  const deps = {
    db,
    env: { INTAKE_IP_SALT: SALT, TURNSTILE_SECRET_KEY: "secret", NODE_ENV: "production", ...over.env },
    fetch: fetchMock,
    now: noon,
  } as unknown as IntakeDeps;
  return { deps, calls, fetchMock, intakeCalls: () => calls.filter((c) => c.fn === "intake_lead") };
}
const send = (deps: IntakeDeps, body: unknown, headers = jsonHeaders()) => handleIntake(deps, typeof body === "string" ? body : JSON.stringify(body), headers);

describe("a good submission", () => {
  it("creates the lead once and promises a reply", async () => {
    const s = setup();
    const r = await send(s.deps, good);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, message: "We'll reach out within 15 minutes." });
    const [c] = s.intakeCalls();
    expect(c.args).toMatchObject({ p_first_name: "Maria", p_last_name: "Del Rio", p_phone: "+13325550101", p_email: "maria@example.com", p_service_type: "commercial", p_borough: "queens", p_consent: true });
  });
  it("stores the server's own consent wording, not text from the browser, and a hashed address", async () => {
    const s = setup();
    expect((await send(s.deps, { ...good, consentWording: "I agree to anything" })).status).toBe(400); // wording is never taken from the browser
    const ok = await send(s.deps, good);
    expect(ok.status).toBe(200);
    const c = s.intakeCalls()[0];
    expect(c.args.p_consent_wording).toBe(CONSENT_WORDING);
    expect(c.args.p_consent_version).toBe(CONSENT_VERSION);
    expect(c.args.p_ip_hash).toBe(hashKey(SALT, "ip:203.0.113.7"));
    expect(JSON.stringify(s.calls)).not.toContain("203.0.113.7");
  });
  it("passes tracking tags through", async () => {
    const s = setup();
    await send(s.deps, { ...good, utm: { source: "google", campaign: "spring" }, page: "https://example.com/clean" });
    expect(s.intakeCalls()[0].args).toMatchObject({ p_utm: { source: "google", campaign: "spring" }, p_page: "https://example.com/clean" });
  });
});

describe("bad input", () => {
  it.each([
    ["not json", "{oops"],
    ["no name", { ...good, name: "" }],
    ["bad phone", { ...good, phone: "12" }],
    ["bad email", { ...good, email: "nope" }],
    ["unknown borough", { ...good, borough: "mars" }],
    ["unexpected field", { ...good, isAdmin: true }],
    ["text consent without a phone", { ...good, phone: undefined }],
    ["a link as a name", { ...good, name: "http://spam.example" }],
  ])("%s is a 400 and writes nothing", async (_n, body) => {
    const s = setup();
    const r = await send(s.deps, body);
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(s.intakeCalls()).toHaveLength(0);
  });
  it("returns field messages for the form to show", async () => {
    const r = await send(setup().deps, { ...good, phone: "12" });
    expect(r.body).toMatchObject({ ok: false, error: "invalid", fields: { phone: [expect.any(String)] } });
  });
  it("refuses a body that is not JSON or is too large", async () => {
    const s = setup();
    expect((await send(s.deps, good, new Headers({ "content-type": "text/plain" }))).status).toBe(400);
    expect((await send(s.deps, JSON.stringify({ ...good, name: "x".repeat(MAX_BODY_BYTES) }))).status).toBe(400);
    expect(s.calls).toHaveLength(0);
  });
  it("turns a database validation error into a 400 and anything else into a 500 with no details", async () => {
    expect((await send(setup({ intakeError: { code: "KC005", message: "that phone number isn't valid" } }).deps, good)).status).toBe(400);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await send(setup({ intakeError: { code: "XX000", message: "relation contacts boom +13325550101" } }).deps, good);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("boom");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("3325550101");
    spy.mockRestore();
  });
});

describe("missing consent", () => {
  it("still takes the lead but records no consent", async () => {
    const s = setup();
    const r = await send(s.deps, { ...good, consent: false, consentVersion: undefined });
    expect(r.status).toBe(200);
    expect(s.intakeCalls()[0].args).toMatchObject({ p_consent: false, p_consent_wording: null, p_consent_version: null });
  });
  it("refuses consent given against a wording version the server does not hold", async () => {
    const s = setup();
    const r = await send(s.deps, { ...good, consentVersion: "old" });
    expect(r.status).toBe(400);
    expect(s.intakeCalls()).toHaveLength(0);
  });
  it("refuses consent with no version at all", async () => {
    const r = await send(setup().deps, { ...good, consentVersion: undefined });
    expect(r.status).toBe(400);
  });
});

describe("duplicates", () => {
  it("looks exactly the same to the visitor as a new lead", async () => {
    const s = setup();
    const first = await send(s.deps, good);
    const second = await send(s.deps, good);
    expect(second).toEqual(first);
    expect(s.intakeCalls()).toHaveLength(2);
  });
});

describe("rate limiting", () => {
  it("stops one address after six attempts, valid or not, with a Retry-After", async () => {
    const s = setup();
    for (let i = 0; i < 6; i++) await send(s.deps, { ...good, phone: `(332) 555-01${10 + i}` });
    const r = await send(s.deps, { ...good, phone: "(332) 555-0199" });
    expect(r.status).toBe(429);
    expect(r.headers?.["retry-after"]).toBe("600");
    expect(s.intakeCalls()).toHaveLength(6);
  });
  it("counts trapped requests against the address but not malformed ones", async () => {
    const s = setup();
    for (let i = 0; i < 6; i++) await send(s.deps, { ...good, honeypot: 1 }); // malformed bodies are rejected before the limiter
    expect(s.calls.filter((c) => c.fn === "intake_rate_hit")).toHaveLength(0);
    for (let i = 0; i < 6; i++) await send(s.deps, { ...good, website: "bot" });
    expect((await send(s.deps, good)).status).toBe(429);
  });
  it("tracks addresses separately", async () => {
    const s = setup();
    for (let i = 0; i < 6; i++) await send(s.deps, { ...good, phone: `(332) 555-01${10 + i}` });
    expect((await send(s.deps, { ...good, phone: "(332) 555-0188" }, jsonHeaders({ "x-real-ip": "198.51.100.9" }))).status).toBe(200);
  });
  it("stops the same person after three attempts in the window, even from new addresses", async () => {
    const s = setup();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await send(s.deps, good, jsonHeaders({ "x-real-ip": `198.51.100.${i + 1}` }))).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });
  it("closes the form when the whole site is hammered", async () => {
    const s = setup();
    const rpc = s.deps.db.rpc as unknown as ReturnType<typeof vi.fn<(fn: string, args: Record<string, unknown>) => Promise<unknown>>>;
    const real = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (fn, args) => (fn === "intake_rate_hit" && args.p_key === "global" ? { data: false, error: null } : real(fn, args)));
    expect((await send(s.deps, good)).status).toBe(503);
    expect(s.intakeCalls()).toHaveLength(0);
  });
  it("fails closed when the limiter itself errors", async () => {
    const s = setup();
    (s.deps.db.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: { code: "XX000", message: "down" } });
    expect((await send(s.deps, good)).status).toBe(500);
  });
});

describe("bot protection", () => {
  it("swallows a filled honeypot with a normal-looking success and creates nothing", async () => {
    const s = setup();
    const r = await send(s.deps, { ...good, website: "http://spam.example" });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(s.intakeCalls()).toHaveLength(0);
    expect(s.fetchMock).not.toHaveBeenCalled();
  });
  it("swallows a form submitted faster than a person can type", async () => {
    const s = setup();
    expect((await send(s.deps, { ...good, elapsedMs: 200 })).status).toBe(200);
    expect(s.intakeCalls()).toHaveLength(0);
  });
  it("refuses when Turnstile says no, or the token is missing", async () => {
    const s = setup({ turnstile: "fail" });
    expect((await send(s.deps, good)).status).toBe(403);
    expect((await send(setup().deps, { ...good, turnstileToken: undefined })).status).toBe(403);
    expect(s.intakeCalls()).toHaveLength(0);
  });
  it("sends the secret to Turnstile from the server only and never echoes it", async () => {
    const s = setup();
    const r = await send(s.deps, good);
    const body = (s.fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("closes the form when Turnstile can't be reached", async () => {
    const s = setup({ turnstile: "down" });
    expect((await send(s.deps, good)).status).toBe(503);
    expect(s.intakeCalls()).toHaveLength(0);
  });
  it("is closed in production without a Turnstile secret, open on a dev machine", async () => {
    expect((await send(setup({ env: { TURNSTILE_SECRET_KEY: undefined } }).deps, good)).status).toBe(503);
    expect((await send(setup({ env: { TURNSTILE_SECRET_KEY: undefined, NODE_ENV: "development" } }).deps, good)).status).toBe(200);
  });
  it("won't run without a salt for the address hash", async () => {
    expect((await send(setup({ env: { INTAKE_IP_SALT: undefined } }).deps, good)).status).toBe(503);
    expect((await send(setup({ env: { INTAKE_IP_SALT: "short" } }).deps, good)).status).toBe(503);
  });
  it("ignores a verify-URL override that is not on this machine", async () => {
    const s = setup({ env: { TURNSTILE_VERIFY_URL: "https://evil.example/verify" } });
    await send(s.deps, good);
    expect((s.fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
  });
});

describe("clientIp and hashKey", () => {
  it("prefers x-real-ip, then the first forwarded hop", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
  it("hashes to 64 hex characters and depends on the salt", () => {
    expect(hashKey("a".repeat(16), "x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKey("a".repeat(16), "x")).not.toBe(hashKey("b".repeat(16), "x"));
  });
});
