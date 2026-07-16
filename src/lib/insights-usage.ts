import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Monthly per-user query cap for /insights — a single shared Anthropic API
 * key pays for every query from every logged-in user, so this is the safety
 * limit against a runaway bill. Override via env; defaults to 50/month.
 */
export const MONTHLY_QUERY_CAP = (() => {
  const raw = process.env.INSIGHTS_MONTHLY_QUERY_CAP;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
})();

// claude-opus-4-8 pricing (per million tokens).
const INPUT_COST_PER_M = 5;
const OUTPUT_COST_PER_M = 25;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_M +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  );
}

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** This user's query count and estimated cost for the current calendar month. */
export async function getMonthlyUsage(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("insights_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .gte("created_at", startOfCurrentMonthIso());
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const inputTokens = rows.reduce((s, r) => s + r.input_tokens, 0);
  const outputTokens = rows.reduce((s, r) => s + r.output_tokens, 0);

  return {
    queryCount: rows.length,
    cap: MONTHLY_QUERY_CAP,
    remaining: Math.max(0, MONTHLY_QUERY_CAP - rows.length),
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd(inputTokens, outputTokens),
  };
}

export async function logInsightsQuery(
  supabase: SupabaseClient<Database>,
  params: {
    userId: string;
    userEmail: string;
    question: string;
    inputTokens: number;
    outputTokens: number;
    channel?: "web" | "sms" | "voice" | "analysis";
    callerPhone?: string;
  },
) {
  const { error } = await supabase.from("insights_usage").insert({
    user_id: params.userId,
    user_email: params.userEmail,
    question: params.question,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    channel: params.channel ?? "web",
    caller_phone: params.callerPhone ?? null,
  });
  if (error) throw new Error(error.message);
}
