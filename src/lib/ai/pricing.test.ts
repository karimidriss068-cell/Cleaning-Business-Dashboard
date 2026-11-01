import { describe, expect, it } from "vitest";
import { MODEL_IDS, MODEL_PRICES, costMicros, estimateInputTokens, microsToCents, worstCaseMicros } from "@/lib/ai/pricing";

const none = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 };

describe("costMicros", () => {
  it("is exact for round numbers: a million haiku input tokens at 100 cents is one dollar", () => {
    expect(costMicros("claude-haiku-5-5", { ...none, inputTokens: 1_000_000 })).toBe(1_000_000);
    expect(costMicros("claude-haiku-5-5", { ...none, outputTokens: 1_000_000 })).toBe(5_000_000);
  });
  it("prices each kind of token separately", () => {
    // sonnet: input 300, output 1500, cache read 30, cache write 375 cents per Mtok
    const c = costMicros("claude-sonnet-5-5", { inputTokens: 1000, outputTokens: 200, cachedInputTokens: 4000, cacheWriteTokens: 800 });
    expect(c).toBe(Math.ceil((1000 * 300 + 200 * 1500 + 4000 * 30 + 800 * 375) / 100));
  });
  it("rounds a call up to the next micro and never down to zero", () => {
    expect(costMicros("grok-4-fast", { ...none, inputTokens: 1 })).toBe(1); // 20/100 of a micro
    expect(costMicros("claude-haiku-5-5", none)).toBe(0);
  });
  it("cached reads are cheaper than fresh input on every model", () => {
    for (const m of MODEL_IDS) expect(MODEL_PRICES[m].cacheReadCentsPerMtok).toBeLessThan(MODEL_PRICES[m].inputCentsPerMtok);
  });
  it("stays an integer", () => {
    for (const m of MODEL_IDS) expect(Number.isInteger(costMicros(m, { inputTokens: 777, outputTokens: 333, cachedInputTokens: 11, cacheWriteTokens: 13 }))).toBe(true);
  });
});

describe("microsToCents", () => {
  it("rounds up to whole cents", () => {
    expect([0, 1, 9999, 10000, 10001, 25_000_000].map(microsToCents)).toEqual([0, 1, 1, 1, 2, 2500]);
  });
});

describe("worstCaseMicros", () => {
  it("is never below the real cost of a call that uses every allowed token", () => {
    for (const m of MODEL_IDS) {
      const chars = 4000;
      const maxTokens = 1000;
      const worst = worstCaseMicros(m, chars, maxTokens, true);
      const real = costMicros(m, { inputTokens: 0, outputTokens: maxTokens, cachedInputTokens: 0, cacheWriteTokens: estimateInputTokens(chars) });
      expect(worst).toBeGreaterThanOrEqual(real);
    }
  });
  it("counts the cache-write premium only when caching is on", () => {
    expect(worstCaseMicros("claude-sonnet-5-5", 10_000, 100, true)).toBeGreaterThan(worstCaseMicros("claude-sonnet-5-5", 10_000, 100, false));
  });
  it("grows with the output allowance", () => {
    expect(worstCaseMicros("claude-haiku-5-5", 100, 2000, false)).toBeGreaterThan(worstCaseMicros("claude-haiku-5-5", 100, 1000, false));
  });
});
