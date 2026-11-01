import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODEL_IDS, MODEL_PRICES, costMicros, microsToCents, worstCaseMicros, type ModelId, type TokenUsage } from "@/lib/ai/pricing";

// The ONLY way the app talks to a language model. Every AI feature (Roast Room, the agents, anything
// later) calls callModel(); nothing else may call a provider or read a provider key (ESLint enforces it).
//
// Order of events: validate the request, refuse if the key isn't set, reserve the worst-case cost
// in the database (which checks the kill switch and every applicable cap under one lock), send, then
// settle the real cost from the provider's own token counts. A refused or failed call costs nothing.
// Prompts and replies are never stored or logged; only counts, model, feature and actor are.

/** No single call may ask for more than this, whatever the caller passes. */
export const MAX_TOKENS_CEILING = 8192;
const TIMEOUT_MS = 90_000;
const MAX_INPUT_CHARS = 400_000;

export type AiRefusal = "kill_switch" | "budget" | "not_configured" | "bad_request";

export class AiRefusedError extends Error {
  constructor(
    readonly reason: AiRefusal,
    message: string,
    readonly detail?: { scope?: string; key?: string; window?: string },
  ) {
    super(message);
    this.name = "AiRefusedError";
  }
}

/** The provider answered with an error, or something unreadable. Never carries the response body. */
export class AiProviderError extends Error {
  constructor(readonly status: number | null) {
    super(status ? `The AI provider answered ${status}` : "The AI provider could not be reached or answered unreadably");
    this.name = "AiProviderError";
  }
}

export const callModelSchema = z.object({
  feature: z.string().regex(/^[a-z0-9_-]{1,60}$/, "feature must be lowercase letters, digits, - or _"),
  actor: z.object({
    type: z.enum(["user", "bot", "system"]),
    // No "*": that is the budget table's wildcard.
    id: z.string().regex(/^[A-Za-z0-9_.:-]{1,80}$/, "actor id has characters that aren't allowed"),
  }),
  model: z.enum(MODEL_IDS as [ModelId, ...ModelId[]]),
  system: z.string().max(MAX_INPUT_CHARS).optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(MAX_INPUT_CHARS) })).min(1).max(100),
  /** Required on purpose: there is no default, and anything above the ceiling is lowered to it. */
  maxTokens: z.number().int().min(1),
  /** Mark the system prompt cacheable (Anthropic) so repeated calls pay the cheap cache-read rate. */
  cacheSystem: z.boolean().default(false),
  runId: z.string().uuid().optional(),
});
export type CallModelInput = z.input<typeof callModelSchema>;

export type CallModelResult = {
  text: string;
  usage: TokenUsage;
  costMicros: number;
  costCents: number;
  usageId: string;
  stopReason: string | null;
};

export type AiDeps = {
  db: Pick<SupabaseClient<Database>, "rpc">;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
};

const reserveSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), usage_id: z.string().uuid() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["kill_switch", "budget"]),
    scope: z.string().optional(),
    key: z.string().optional(),
    window: z.string().optional(),
  }),
]);

const int0 = z.number().int().min(0);
const anthropicReply = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  stop_reason: z.string().nullish(),
  usage: z.object({ input_tokens: int0, output_tokens: int0, cache_creation_input_tokens: int0.nullish(), cache_read_input_tokens: int0.nullish() }),
});
const xaiReply = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }), finish_reason: z.string().nullish() })).min(1),
  usage: z.object({
    prompt_tokens: int0,
    completion_tokens: int0,
    prompt_tokens_details: z.object({ cached_tokens: int0.nullish() }).nullish(),
    completion_tokens_details: z.object({ reasoning_tokens: int0.nullish() }).nullish(),
  }),
});

const isLocal = (url: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
// The base-URL overrides exist for tests and are ignored unless they point at this machine.
const baseUrl = (override: string | undefined, real: string) => (override && isLocal(override) ? override : real);

type Sent = { text: string; usage: TokenUsage; stopReason: string | null };

async function post(deps: AiDeps, url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await deps.fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new AiProviderError(null);
  }
  if (!res.ok) throw new AiProviderError(res.status);
  try {
    return await res.json();
  } catch {
    throw new AiProviderError(null);
  }
}

async function sendAnthropic(deps: AiDeps, key: string, input: z.output<typeof callModelSchema>, maxTokens: number): Promise<Sent> {
  const system = input.system ? [{ type: "text", text: input.system, ...(input.cacheSystem ? { cache_control: { type: "ephemeral" } } : {}) }] : undefined;
  const json = await post(deps, `${baseUrl(deps.env.AI_ANTHROPIC_BASE, "https://api.anthropic.com")}/v1/messages`, { "x-api-key": key, "anthropic-version": "2023-06-01" }, {
    model: input.model, max_tokens: maxTokens, system, messages: input.messages,
  });
  const p = anthropicReply.safeParse(json);
  if (!p.success) throw new AiProviderError(null);
  const u = p.data.usage;
  return {
    text: p.data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
    // Anthropic's input_tokens already excludes cache reads and writes, which are billed separately.
    usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 },
    stopReason: p.data.stop_reason ?? null,
  };
}

async function sendXai(deps: AiDeps, key: string, input: z.output<typeof callModelSchema>, maxTokens: number): Promise<Sent> {
  const messages = [...(input.system ? [{ role: "system", content: input.system }] : []), ...input.messages];
  const json = await post(deps, `${baseUrl(deps.env.AI_XAI_BASE, "https://api.x.ai")}/v1/chat/completions`, { authorization: `Bearer ${key}` }, {
    model: input.model, max_tokens: maxTokens, messages,
  });
  const p = xaiReply.safeParse(json);
  if (!p.success) throw new AiProviderError(null);
  const u = p.data.usage;
  const cached = Math.min(u.prompt_tokens_details?.cached_tokens ?? 0, u.prompt_tokens);
  const choice = p.data.choices[0];
  return {
    text: choice.message.content ?? "",
    // prompt_tokens includes the cached ones; reasoning tokens are billed as output.
    usage: { inputTokens: u.prompt_tokens - cached, outputTokens: u.completion_tokens + (u.completion_tokens_details?.reasoning_tokens ?? 0), cachedInputTokens: cached, cacheWriteTokens: 0 },
    stopReason: choice.finish_reason ?? null,
  };
}

const refusalText = (r: Extract<z.infer<typeof reserveSchema>, { ok: false }>) =>
  r.reason === "kill_switch"
    ? "AI is switched off right now."
    : `The ${r.window ?? ""} AI budget for ${r.scope === "global" ? "all AI" : `${r.scope ?? "this"} ${r.key ?? ""}`.trim()} has been reached.`.replace("  ", " ");

export async function callModel(raw: CallModelInput, deps: AiDeps = { db: createAdminClient(), env: process.env, fetch }): Promise<CallModelResult> {
  const parsed = callModelSchema.safeParse(raw);
  if (!parsed.success) throw new AiRefusedError("bad_request", parsed.error.issues[0]?.message ?? "Invalid AI request");
  const input = parsed.data;
  const maxTokens = Math.min(input.maxTokens, MAX_TOKENS_CEILING);
  const price = MODEL_PRICES[input.model];

  // Provider keys are read here and nowhere else. The MAKI key (ANTHROPIC_API_KEY) is deliberately not used.
  const key = price.provider === "anthropic" ? deps.env.CLEANING_ANTHROPIC_API_KEY : deps.env.XAI_API_KEY;
  if (!key) throw new AiRefusedError("not_configured", `No ${price.provider === "anthropic" ? "Anthropic" : "xAI"} key is set for this app.`);

  const inputChars = (input.system?.length ?? 0) + input.messages.reduce((n, m) => n + m.content.length, 0);
  const hold = worstCaseMicros(input.model, inputChars, maxTokens, input.cacheSystem);

  const { data, error } = await deps.db.rpc("ai_reserve", {
    p_actor_type: input.actor.type,
    p_actor_id: input.actor.id,
    p_feature: input.feature,
    p_provider: price.provider,
    p_model: input.model,
    p_est_micros: hold,
    p_run_id: input.runId as string,
  });
  const reserved = reserveSchema.safeParse(data);
  if (error || !reserved.success) throw new Error("AI spend check failed; the call was not sent.");
  if (!reserved.data.ok) throw new AiRefusedError(reserved.data.reason, refusalText(reserved.data), { scope: reserved.data.scope, key: reserved.data.key, window: reserved.data.window });
  const usageId = reserved.data.usage_id;

  let sent: Sent;
  try {
    sent = price.provider === "anthropic" ? await sendAnthropic(deps, key, input, maxTokens) : await sendXai(deps, key, input, maxTokens);
  } catch (e) {
    await deps.db.rpc("ai_fail", { p_usage_id: usageId, p_detail: e instanceof AiProviderError ? `provider:${e.status ?? "unreadable"}` : "failed" });
    throw e;
  }

  const cost = costMicros(input.model, sent.usage);
  const settle = () => deps.db.rpc("ai_settle", {
    p_usage_id: usageId, p_input: sent.usage.inputTokens, p_output: sent.usage.outputTokens,
    p_cached: sent.usage.cachedInputTokens, p_cache_write: sent.usage.cacheWriteTokens, p_cost_micros: cost,
  });
  let settled = await settle();
  if (settled.error) settled = await settle();
  // If settling still fails the hold stays at its worst case until it expires: the cap errs on the safe side.
  if (settled.error) console.error("ai_settle failed", settled.error.code ?? "unknown", usageId);

  return { text: sent.text, usage: sent.usage, costMicros: cost, costCents: microsToCents(cost), usageId, stopReason: sent.stopReason };
}
