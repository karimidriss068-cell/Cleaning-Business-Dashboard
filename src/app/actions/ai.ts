"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import { budgetSchema, killSwitchSchema, removeBudgetSchema } from "@/lib/schemas/ai";

// AI spend settings. Owner only: the database function refuses anyone else and logs each change.
// These actions never call a model; they only change the caps and the kill switch.

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";
function refresh() {
  revalidatePath("/settings/ai-usage");
  revalidatePath("/command-center");
}

export async function saveAiBudget(input: unknown): Promise<FinanceResult> {
  const p = budgetSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_ai_budget", {
    p_scope: p.data.scope, p_key: p.data.key, p_daily: p.data.dailyCents as number, p_monthly: p.data.monthlyCents as number, p_hard_stop: p.data.hardStop,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function deleteAiBudget(input: unknown): Promise<FinanceResult> {
  const p = removeBudgetSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_ai_budget", { p_scope: p.data.scope, p_key: p.data.key });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function setAiKillSwitch(input: unknown): Promise<FinanceResult> {
  const p = killSwitchSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("set_ai_kill_switch", { p_on: p.data.on });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}
