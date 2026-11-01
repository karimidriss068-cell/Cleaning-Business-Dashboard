import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, AiRefusedError, callModel, MAX_TOKENS_CEILING, type AiDeps, type CallModelInput } from "@/lib/ai/call-model";
import { costMicros } from "@/lib/ai/pricing";

const KEY = "sk-cleaning-test";
const XAI = "xai-test";
const base: CallModelInput = {
  feature: "board", actor: { type: "bot", id: "roast" }, model: "claude-haiku-5-5", system: "You are a coach.",
  messages: [{ role: "user", content: "Say hi to Maria at 332-555-0101" }], maxTokens: 500,
};

type Rpc = { fn: string; args: Record<string, unknown> };

/** A stand-in for the database that holds and settles like ai_reserve does, one request at a time. */
function fakeDb(opts: { capMicros?: number; kill?: boolean; budgetScope?: string; settleFailures?: number; reserveError?: boolean } = {}) {
  const calls: Rpc[] = [];
  const holds = new Map<string, number>();
  let used = 0;
  let peak = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let settleFailures = opts.settleFailures ?? 0;
  const serial = <T,>(fn: () => T): Promise<T> => {
    const run = queue.then(async () => { await new Promise((r) => setTimeout(r, 1)); return fn(); });
    queue = run.catch(() => undefined);
    return run;
  };
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "ai_reserve") {
      if (opts.reserveError) return { data: null, error: { code: "XX000", message: "down" } };
      return serial(() => {
        if (opts.kill) return { data: { ok: false, reason: "kill_switch" }, error: null };
        const est = Number(args.p_est_micros);
        if (opts.capMicros !== undefined && used + est > opts.capMicros) {
          return { data: { ok: false, reason: "budget", scope: opts.budgetScope ?? "feature", key: "board", window: "daily" }, error: null };
        }
        used += est;
        peak = Math.max(peak, used);
        const id = crypto.randomUUID();
        holds.set(id, est);
        return { data: { ok: true, usage_id: id }, error: null };
      });
    }
    if (fn === "ai_settle") {
      if (settleFailures > 0) { settleFailures--; return { data: null, error: { code: "XX000", message: "down" } }; }
      return serial(() => { used += Number(args.p_cost_micros) - (holds.get(String(args.p_usage_id)) ?? 0); holds.set(String(args.p_usage_id), Number(args.p_cost_micros)); return { data: null, error: null }; });
    }
    if (fn === "ai_fail") return serial(() => { used -= holds.get(String(args.p_usage_id)) ?? 0; holds.set(String(args.p_usage_id), 0); return { data: null, error: null }; });
    return { data: null, error: { code: "42883", message: "unknown" } };
  });
  return { rpc, calls, used: () => used, peak: () => peak };
}

const anthropicJson = (over: Record<string, unknown> = {}) => ({
  content: [{ type: "text", text: "Hi Maria!" }], stop_reason: "end_turn",
  usage: { input_tokens: 120, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, ...over,
});
const xaiJson = (over: Record<string, unknown> = {}) => ({
  choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 600 }, completion_tokens_details: { reasoning_tokens: 20 } }, ...over,
});

function setup(db = fakeDb(), reply: () => Response | Promise<Response> = () => Response.json(anthropicJson()), env: Record<string, string | undefined> = { CLEANING_ANTHROPIC_API_KEY: KEY, XAI_API_KEY: XAI }) {
  const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => (void args, reply()));
  const deps = { db: { rpc: db.rpc }, env, fetch: fetchMock } as unknown as AiDeps;
  const sentBody = () => JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
  const sentHeaders = () => (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
  return { db, deps, fetchMock, sentBody, sentHeaders };
}

afterEach(() => vi.restoreAllMocks());

describe("a normal call", () => {
  it("reserves first, sends with the app's own key, then settles the real cost", async () => {
    const s = setup();
    const r = await callModel(base, s.deps);
    expect(s.db.calls.map((c) => c.fn)).toEqual(["ai_reserve", "ai_settle"]);
    expect(s.sentHeaders()["x-api-key"]).toBe(KEY);
    expect(String(s.fetchMock.mock.calls[0][0])).toBe("https://api.anthropic.com/v1/messages");
    expect(s.db.calls[0].args).toMatchObject({ p_actor_type: "bot", p_actor_id: "roast", p_feature: "board", p_provider: "anthropic", p_model: "claude-haiku-5-5" });
    const usage = { inputTokens: 120, outputTokens: 30, cachedInputTokens: 0, cacheWriteTokens: 0 };
    expect(r).toMatchObject({ text: "Hi Maria!", usage, costMicros: costMicros("claude-haiku-5-5", usage), costCents: 1 });
    expect(s.db.calls[1].args).toMatchObject({ p_usage_id: r.usageId, p_input: 120, p_output: 30, p_cost_micros: r.costMicros });
  });
  it("holds at least the real cost, then leaves only the real cost behind", async () => {
    const s = setup();
    const r = await callModel(base, s.deps);
    expect(Number(s.db.calls[0].args.p_est_micros)).toBeGreaterThanOrEqual(r.costMicros);
    expect(s.db.used()).toBe(r.costMicros);
  });
  it("marks the system prompt cacheable and prices cache reads and writes", async () => {
    const s = setup(fakeDb(), () => Response.json(anthropicJson({ usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2000, cache_read_input_tokens: 3000 } })));
    const r = await callModel({ ...base, cacheSystem: true }, s.deps);
    expect(s.sentBody().system[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    expect(r.usage).toEqual({ inputTokens: 10, outputTokens: 5, cachedInputTokens: 3000, cacheWriteTokens: 2000 });
    expect(r.costMicros).toBe(Math.ceil((10 * 100 + 5 * 500 + 3000 * 10 + 2000 * 125) / 100));
  });
  it("sends no cache marker when caching is off", async () => {
    const s = setup();
    await callModel(base, s.deps);
    expect(s.sentBody().system[0].cache_control).toBeUndefined();
  });
  it("talks to xAI with its own key and splits cached tokens and reasoning", async () => {
    const s = setup(fakeDb(), () => Response.json(xaiJson()));
    const r = await callModel({ ...base, model: "grok-4" }, s.deps);
    expect(String(s.fetchMock.mock.calls[0][0])).toBe("https://api.x.ai/v1/chat/completions");
    expect(s.sentHeaders().authorization).toBe(`Bearer ${XAI}`);
    expect(s.sentBody().messages[0]).toEqual({ role: "system", content: "You are a coach." });
    expect(r.usage).toEqual({ inputTokens: 400, outputTokens: 70, cachedInputTokens: 600, cacheWriteTokens: 0 });
    expect(s.db.calls[0].args.p_provider).toBe("xai");
  });
});

describe("max_tokens", () => {
  it("is required, positive and a whole number", async () => {
    for (const bad of [undefined, 0, -5, 1.5]) {
      const s = setup();
      await expect(callModel({ ...base, maxTokens: bad as number }, s.deps)).rejects.toMatchObject({ reason: "bad_request" });
      expect(s.db.calls).toHaveLength(0);
      expect(s.fetchMock).not.toHaveBeenCalled();
    }
  });
  it("is lowered to the ceiling, and the hold is for the lowered amount", async () => {
    const s = setup();
    await callModel({ ...base, maxTokens: 1_000_000 }, s.deps);
    expect(s.sentBody().max_tokens).toBe(MAX_TOKENS_CEILING);
    expect(Number(s.db.calls[0].args.p_est_micros)).toBeLessThan(Math.ceil((MAX_TOKENS_CEILING * 500) / 100) + 1000);
  });
  it("is passed through when it is under the ceiling", async () => {
    const s = setup();
    await callModel({ ...base, maxTokens: 321 }, s.deps);
    expect(s.sentBody().max_tokens).toBe(321);
  });
});

describe("refusals send nothing", () => {
  it("kill switch", async () => {
    const s = setup(fakeDb({ kill: true }));
    await expect(callModel(base, s.deps)).rejects.toMatchObject({ name: "AiRefusedError", reason: "kill_switch" });
    expect(s.fetchMock).not.toHaveBeenCalled();
    expect(s.db.calls.map((c) => c.fn)).toEqual(["ai_reserve"]);
  });
  it("a cap, naming the scope and window", async () => {
    const s = setup(fakeDb({ capMicros: 1 }));
    const e = await callModel(base, s.deps).catch((x) => x);
    expect(e).toBeInstanceOf(AiRefusedError);
    expect(e).toMatchObject({ reason: "budget", detail: { scope: "feature", key: "board", window: "daily" } });
    expect(e.message).toMatch(/daily AI budget/);
    expect(s.fetchMock).not.toHaveBeenCalled();
  });
  it("a missing key, before anything is reserved; the MAKI key is never used", async () => {
    const s = setup(fakeDb(), undefined, { ANTHROPIC_API_KEY: "maki-key-must-not-be-used", XAI_API_KEY: XAI });
    await expect(callModel(base, s.deps)).rejects.toMatchObject({ reason: "not_configured" });
    expect(s.db.calls).toHaveLength(0);
    expect(s.fetchMock).not.toHaveBeenCalled();
    const x = setup(fakeDb(), undefined, { CLEANING_ANTHROPIC_API_KEY: KEY });
    await expect(callModel({ ...base, model: "grok-4" }, x.deps)).rejects.toMatchObject({ reason: "not_configured" });
  });
  it("a spend check that errors counts as a refusal, not a free pass", async () => {
    const s = setup(fakeDb({ reserveError: true }));
    await expect(callModel(base, s.deps)).rejects.toThrow(/was not sent/);
    expect(s.fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ["unknown model", { model: "gpt-9" }],
    ["bad feature", { feature: "Board!" }],
    ["wildcard actor", { actor: { type: "bot", id: "*" } }],
    ["no messages", { messages: [] }],
    ["empty message", { messages: [{ role: "user", content: "" }] }],
  ])("%s", async (_n, over) => {
    const s = setup();
    await expect(callModel({ ...base, ...over } as CallModelInput, s.deps)).rejects.toMatchObject({ reason: "bad_request" });
    expect(s.db.calls).toHaveLength(0);
  });
});

describe("when the provider fails", () => {
  it("releases the hold and throws without the response body", async () => {
    const s = setup(fakeDb(), () => new Response("secret internal detail sk-leak", { status: 500 }));
    const e = await callModel(base, s.deps).catch((x) => x);
    expect(e).toBeInstanceOf(AiProviderError);
    expect(e.status).toBe(500);
    expect(e.message).not.toContain("leak");
    expect(s.db.calls.map((c) => c.fn)).toEqual(["ai_reserve", "ai_fail"]);
    expect(s.db.used()).toBe(0);
  });
  it("treats an unreadable reply as a failure that costs nothing", async () => {
    const s = setup(fakeDb(), () => Response.json({ nonsense: true }));
    await expect(callModel(base, s.deps)).rejects.toBeInstanceOf(AiProviderError);
    expect(s.db.used()).toBe(0);
  });
  it("treats a network error the same way", async () => {
    const s = setup(fakeDb(), () => { throw new Error("ECONNRESET"); });
    await expect(callModel(base, s.deps)).rejects.toMatchObject({ status: null });
    expect(s.db.used()).toBe(0);
  });
  it("retries settling once, and keeps the safe hold if it still can't settle", async () => {
    const once = setup(fakeDb({ settleFailures: 1 }));
    const r = await callModel(base, once.deps);
    expect(once.db.calls.filter((c) => c.fn === "ai_settle")).toHaveLength(2);
    expect(once.db.used()).toBe(r.costMicros);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const twice = setup(fakeDb({ settleFailures: 2 }));
    const r2 = await callModel(base, twice.deps);
    expect(r2.text).toBe("Hi Maria!");
    expect(twice.db.used()).toBe(Number(twice.db.calls[0].args.p_est_micros));
    expect(spy).toHaveBeenCalled();
  });
});

describe("privacy", () => {
  it("never puts prompt or reply text in what is stored or logged", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = setup(fakeDb({ settleFailures: 2 }));
    await callModel(base, s.deps);
    const stored = JSON.stringify(s.db.calls);
    expect(stored).not.toContain("Maria");
    expect(stored).not.toContain("332-555");
    expect(stored).not.toContain("coach");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("Maria");
  });
  it("ignores a base-URL override that isn't on this machine", async () => {
    const s = setup(fakeDb(), undefined, { CLEANING_ANTHROPIC_API_KEY: KEY, AI_ANTHROPIC_BASE: "https://evil.example" });
    await callModel(base, s.deps);
    expect(String(s.fetchMock.mock.calls[0][0])).toBe("https://api.anthropic.com/v1/messages");
    const local = setup(fakeDb(), undefined, { CLEANING_ANTHROPIC_API_KEY: KEY, AI_ANTHROPIC_BASE: "http://127.0.0.1:3199" });
    await callModel(base, local.deps);
    expect(String(local.fetchMock.mock.calls[0][0])).toBe("http://127.0.0.1:3199/v1/messages");
  });
});

describe("concurrent calls", () => {
  it("never hold or spend past a cap, even when 40 calls arrive at once", async () => {
    const hold = 5000; // roughly what one 500-token haiku call holds
    const cap = hold * 7 + 2000;
    const s = setup(fakeDb({ capMicros: cap }));
    const results = await Promise.allSettled(Array.from({ length: 40 }, () => callModel(base, s.deps)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const refused = results.filter((r) => r.status === "rejected" && (r.reason as AiRefusedError).reason === "budget").length;
    expect(ok + refused).toBe(40);
    expect(ok).toBeGreaterThan(0);
    expect(refused).toBeGreaterThan(0);
    expect(s.fetchMock).toHaveBeenCalledTimes(ok);
    expect(s.db.peak()).toBeLessThanOrEqual(cap); // spent plus held never passed the cap, at any moment
    const held = Number(s.db.calls.find((c) => c.fn === "ai_reserve")?.args.p_est_micros);
    expect(ok).toBeGreaterThanOrEqual(Math.floor(cap / held));
  });
});
