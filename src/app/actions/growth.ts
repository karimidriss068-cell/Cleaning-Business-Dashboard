"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import { adSpendIdSchema, adSpendSchema, assumptionsSchema, campaignSchema, cashSchema, planSchema } from "@/lib/schemas/growth";

// Owner/admin edits to the growth plan, assumptions, cash settings and manual
// ad spend. Nothing here talks to an ad platform: spend is typed in. Each call
// is validated here, then again by the database function that makes the change
// in one transaction and logs it.

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";
function refresh() {
  revalidatePath("/growth");
  revalidatePath("/command-center");
}

export async function saveGrowthPlan(input: unknown): Promise<FinanceResult> {
  const p = planSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_growth_plan", {
    p_start_date: p.data.startDate,
    p_residential_cents: p.data.residentialCents,
    p_commercial_cents: p.data.commercialCents,
    p_milestones: p.data.milestonesCents,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function saveGrowthAssumptions(input: unknown): Promise<FinanceResult> {
  const p = assumptionsSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_growth_assumptions", {
    p_visit_price_cents: p.data.visitPriceCents,
    p_visits_per_month: p.data.visitsPerMonth,
    p_account_value_cents: p.data.accountValueCents,
    p_close_rate_bps: p.data.closeRateBps,
    p_cac_cents: p.data.cacCents,
    p_margin_bps: p.data.marginBps,
    p_ad_budget_cents: p.data.adBudgetCents,
    p_reply_target_minutes: p.data.replyTargetMinutes,
    p_cleans_per_cleaner: p.data.cleansPerCleaner,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function saveCashSettings(input: unknown): Promise<FinanceResult> {
  const p = cashSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_cash_settings", {
    p_starting_cents: p.data.startingCents,
    p_cash_start_date: p.data.cashStartDate,
    p_fixed_cents: p.data.fixedCents,
    p_buffer_cents: p.data.bufferCents,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function createAdCampaign(input: unknown): Promise<FinanceResult<{ id: string }>> {
  const p = campaignSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("create_ad_campaign", { p_platform: p.data.platform, p_name: p.data.name });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true, id: data };
}

export async function recordAdSpend(input: unknown): Promise<FinanceResult> {
  const p = adSpendSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("record_ad_spend", { p_campaign_id: p.data.campaignId, p_date: p.data.date, p_spend_cents: p.data.spendCents });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function deleteAdSpend(input: unknown): Promise<FinanceResult> {
  const p = adSpendIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_ad_spend", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}
