"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { callModel } from "@/lib/ai/call-model";
import { financeContext } from "@/lib/finance-auth";
import { loadGrowthSnapshot } from "@/lib/growth-data";
import { buildBoardContext } from "@/lib/board/context";
import { findCachedSession } from "@/lib/board/data";
import { runBoard } from "@/lib/board/run";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import { boardRunSchema, logDecisionSchema, sessionIdSchema } from "@/lib/schemas/board";
import type { Json } from "@/lib/supabase/database.types";

// The Roast Room. Owner and admin only: staff and cleaners are refused here, by the database functions
// and by row-level security. Model calls go through callModel() under the feature "board".

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";
const forbidden = { ok: false, code: "forbidden", message: "Only the owner and admins can use the Roast Room." } as const;

export async function runBoardSession(input: unknown): Promise<FinanceResult<{ sessionId: string; cached: boolean; partial: boolean; notice: string | null }>> {
  const p = boardRunSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return forbidden;

  let context: string | null = null;
  if (p.data.useContext) {
    try {
      context = buildBoardContext(await loadGrowthSnapshot(ctx.supabase));
    } catch {
      return invalid("The business snapshot could not be loaded. Try again, or run without it.");
    }
  }

  try {
    const outcome = await runBoard(p.data, context, ctx.user.id, {
      call: (i) => callModel(i),
      findCached: (hash) => findCachedSession(ctx.supabase, hash),
      newRunId: () => crypto.randomUUID(),
      save: async (s) => {
        const { data, error } = await ctx.supabase.rpc("save_board_session", {
          p_question: s.question, p_advisors: s.advisors, p_rounds: s.rounds, p_use_context: s.useContext, p_input_hash: s.inputHash,
          p_status: s.status, p_advisor_outputs: s.advisorOutputs as Json, p_synthesis: s.synthesis as Json,
          p_est_micros: s.estMicros, p_cost_micros: s.costMicros, p_run_id: s.runId,
        });
        if (error || !data) throw new Error("The session could not be saved.");
        return data;
      },
    });
    if (outcome.kind === "refused") return { ok: false, code: "not_allowed", message: outcome.message };
    revalidatePath("/board");
    if (outcome.kind === "cached") return { ok: true, sessionId: outcome.sessionId, cached: true, partial: false, notice: "You asked this within the last 24 hours, so the saved answer is shown. It cost nothing." };
    return { ok: true, sessionId: outcome.sessionId, cached: false, partial: outcome.status === "partial", notice: outcome.stopped };
  } catch (e) {
    return { ok: false, code: "error", message: e instanceof Error ? e.message : "The session could not be completed." };
  }
}

export async function logBoardDecision(input: unknown): Promise<FinanceResult> {
  const p = logDecisionSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return forbidden;
  const { error } = await ctx.supabase.rpc("log_board_decision", { p_session_id: p.data.sessionId, p_action_index: p.data.actionIndex });
  if (error) return mapFinanceError(error);
  revalidatePath(`/board/${p.data.sessionId}`);
  revalidatePath("/board");
  revalidatePath("/growth");
  return { ok: true };
}

export async function deleteBoardSession(input: unknown): Promise<FinanceResult> {
  const p = sessionIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return forbidden;
  const { error } = await ctx.supabase.rpc("delete_board_session", { p_id: p.data.sessionId });
  if (error) return mapFinanceError(error);
  revalidatePath("/board");
  return { ok: true };
}
