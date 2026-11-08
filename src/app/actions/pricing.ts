"use server";

import { revalidatePath } from "next/cache";
import { financeContext } from "@/lib/finance-auth";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import { savePricingSchema } from "@/lib/schemas/pricing";

// Pricing rules. Owner and admin only: the database function refuses anyone else, checks the version
// (a stale save is refused, never merged) and logs the change. Nothing here calls a model.

export async function savePricingRules(input: unknown): Promise<FinanceResult<{ version: number }>> {
  const p = savePricingSchema.safeParse(input);
  if (!p.success) return invalid(p.error.issues[0]?.message ?? "Check the form");
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("save_pricing_rules", { p_expected_version: p.data.expectedVersion, p_rules: p.data.rules });
  if (error) return mapFinanceError(error);
  revalidatePath("/settings/pricing");
  return { ok: true, version: Number(data) };
}
