// What each model costs, in whole cents per million tokens, and the cost math in integer
// millionths of a dollar ("micros"): tokens * cents-per-Mtok / 100 is exactly micros, so the only
// rounding is one round-up per call, and every call is counted at or above its true cost.
//
// PLACEHOLDER PRICES: confirm each against the provider's pricing page before relying on the
// numbers, and update them here (the only copy) when a provider changes its rates. A model that
// isn't listed can't be called at all.

export type Provider = "anthropic" | "xai";

export type ModelPrice = {
  provider: Provider;
  inputCentsPerMtok: number;
  outputCentsPerMtok: number;
  /** Input tokens served from the prompt cache. */
  cacheReadCentsPerMtok: number;
  /** Input tokens written to the prompt cache (Anthropic charges a premium; xAI caches automatically at the input rate). */
  cacheWriteCentsPerMtok: number;
};

export const MODEL_PRICES = {
  "claude-fable-5-1": { provider: "anthropic", inputCentsPerMtok: 1500, outputCentsPerMtok: 7500, cacheReadCentsPerMtok: 150, cacheWriteCentsPerMtok: 1875 },
  "claude-opus-5-5": { provider: "anthropic", inputCentsPerMtok: 1500, outputCentsPerMtok: 7500, cacheReadCentsPerMtok: 150, cacheWriteCentsPerMtok: 1875 },
  "claude-sonnet-5-5": { provider: "anthropic", inputCentsPerMtok: 300, outputCentsPerMtok: 1500, cacheReadCentsPerMtok: 30, cacheWriteCentsPerMtok: 375 },
  "claude-haiku-5-5": { provider: "anthropic", inputCentsPerMtok: 100, outputCentsPerMtok: 500, cacheReadCentsPerMtok: 10, cacheWriteCentsPerMtok: 125 },
  "grok-4": { provider: "xai", inputCentsPerMtok: 300, outputCentsPerMtok: 1500, cacheReadCentsPerMtok: 75, cacheWriteCentsPerMtok: 300 },
  "grok-4-fast": { provider: "xai", inputCentsPerMtok: 20, outputCentsPerMtok: 50, cacheReadCentsPerMtok: 5, cacheWriteCentsPerMtok: 20 },
} as const satisfies Record<string, ModelPrice>;

export type ModelId = keyof typeof MODEL_PRICES;
export const MODEL_IDS = Object.keys(MODEL_PRICES) as ModelId[];

export type TokenUsage = {
  /** Input tokens billed at the full input rate (not cached). */
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
};

/** The real cost of one call in micros (millionths of a dollar), rounded up. */
export function costMicros(model: ModelId, u: TokenUsage): number {
  const p: ModelPrice = MODEL_PRICES[model];
  const numerator =
    u.inputTokens * p.inputCentsPerMtok + u.outputTokens * p.outputCentsPerMtok +
    u.cachedInputTokens * p.cacheReadCentsPerMtok + u.cacheWriteTokens * p.cacheWriteCentsPerMtok;
  return Math.ceil(numerator / 100);
}

/** Cents for display, rounded up: 1 micro is already a cent here. */
export const microsToCents = (micros: number) => Math.ceil(micros / 10_000);

/** A deliberately pessimistic guess (two characters per token), so the hold is rarely below the real cost. */
export const estimateInputTokens = (chars: number) => Math.ceil(chars / 2);

/**
 * The most a call could cost: every estimated input token at the dearest input rate it could be
 * billed at, plus every allowed output token. This is what is held against the caps before sending.
 */
export function worstCaseMicros(model: ModelId, inputChars: number, maxTokens: number, caching: boolean): number {
  const p: ModelPrice = MODEL_PRICES[model];
  const inputRate = caching ? Math.max(p.inputCentsPerMtok, p.cacheWriteCentsPerMtok) : p.inputCentsPerMtok;
  return Math.ceil((estimateInputTokens(inputChars) * inputRate + maxTokens * p.outputCentsPerMtok) / 100);
}
