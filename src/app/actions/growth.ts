"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import {
  adSpendIdSchema,
  adSpendSchema,
  assumptionsSchema,
  campaignSchema,
  cashSchema,
  channelTestSchema,
  decisionIdSchema,
  decisionSchema,
  expenseIdSchema,
  expenseSchema,
  forecastSchema,
  gateCriteriaSchema,
  hireTriggersSchema,
  leadAttributionSchema,
  planSchema,
  tierSettingsSchema,
} from "@/lib/schemas/growth";

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
  const { data, error } = await ctx.supabase.rpc("create_ad_campaign", { p_platform: p.data.platform, p_name: p.data.name, p_channel: p.data.channel });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true, id: data };
}

export async function recordAdSpend(input: unknown): Promise<FinanceResult> {
  const p = adSpendSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("record_ad_spend", { p_campaign_id: p.data.campaignId, p_date: p.data.date, p_spend_cents: p.data.spendCents, p_creative: p.data.creative });
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

// Part 2: the 12-month north star ---------------------------------------------

export async function saveTierSettings(input: unknown): Promise<FinanceResult> {
  const p = tierSettingsSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_tier_settings", {
    p_tier: p.data.tier,
    p_base_cents: p.data.baseCents,
    p_strong_cents: p.data.strongCents,
    p_north_profit_cents: p.data.northProfitCents,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function saveForecastAssumptions(input: unknown): Promise<FinanceResult> {
  const p = forecastSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_forecast_assumptions", { p_churn_bps: p.data.churnBps, p_cleans_per_crew: p.data.cleansPerCrew });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function saveGateCriteria(input: unknown): Promise<FinanceResult> {
  const p = gateCriteriaSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_gate_criteria", { p_rows: p.data.rows });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function saveHireTriggers(input: unknown): Promise<FinanceResult> {
  const p = hireTriggersSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_hire_triggers", { p_rows: p.data.rows });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function addDecision(input: unknown): Promise<FinanceResult> {
  const p = decisionSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("add_growth_decision", { p_date: p.data.date, p_kind: p.data.kind, p_note: p.data.note, p_decision: p.data.decision });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function deleteDecision(input: unknown): Promise<FinanceResult> {
  const p = decisionIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_growth_decision", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function recordExpense(input: unknown): Promise<FinanceResult> {
  const p = expenseSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("record_expense", { p_category: p.data.category, p_amount_cents: p.data.amountCents, p_date: p.data.date, p_description: p.data.description });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function deleteExpense(input: unknown): Promise<FinanceResult> {
  const p = expenseIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_expense", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

/** The database refuses a plan whose remaining spend would take cash under the buffer; its message is shown as is. */
export async function saveChannelTest(input: unknown): Promise<FinanceResult> {
  const p = channelTestSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_channel_test", {
    p_judge_spend_cents: p.data.judgeSpendCents,
    p_judge_leads: p.data.judgeLeads,
    p_loser_ratio_x100: p.data.loserRatioX100,
    p_daily_week1_cents: p.data.dailyWeek1Cents,
    p_daily_after_cents: p.data.dailyAfterCents,
    p_window_weeks: p.data.windowWeeks,
    p_start_date: p.data.startDate as string,
    p_channels: p.data.channels,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

/** Office staff correct a lead's channel and creative from the lead record. */
export async function setLeadAttribution(input: unknown): Promise<FinanceResult<{ updatedAt: string }>> {
  const p = leadAttributionSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("set_lead_attribution", { p_lead_id: p.data.leadId, p_channel: p.data.channel, p_creative: p.data.creative });
  if (error) return mapFinanceError(error);
  revalidatePath("/growth");
  return { ok: true, updatedAt: data };
}
