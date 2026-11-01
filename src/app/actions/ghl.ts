"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import { consentSchema, ghlSettingsSchema, retrySchema, templateSchema } from "@/lib/schemas/ghl";

// GoHighLevel settings. Owner/admin switch a template between dry-run and live, edit its words,
// save the pipeline mapping and limits, and retry a failed sync; staff record text consent.
// Each call is validated here and again by the database function, which logs the change.

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";
function refresh() {
  revalidatePath("/settings/integrations");
  revalidatePath("/command-center");
}

export async function saveMessageTemplate(input: unknown): Promise<FinanceResult> {
  const p = templateSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("save_message_template", { p_key: p.data.key, p_body: p.data.body, p_mode: p.data.mode });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function saveGhlSettings(input: unknown): Promise<FinanceResult> {
  const p = ghlSettingsSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const stageIds = Object.fromEntries(Object.entries(p.data.stageIds).filter(([, v]) => v !== null));
  const { error } = await ctx.supabase.rpc("save_ghl_settings", {
    p_pipeline_id: p.data.pipelineId ?? "",
    p_stage_ids: stageIds,
    p_opportunity_sync_mode: p.data.opportunitySyncMode,
    p_business_name: p.data.businessName,
    p_max_per_contact_per_day: p.data.maxPerContactPerDay,
    p_max_per_hour: p.data.maxPerHour,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function retryGhlSync(input: unknown): Promise<FinanceResult> {
  const p = retrySchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("retry_ghl_sync", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

/** Office staff record, or take back, a customer's agreement to automated texts. */
export async function setSmsConsent(input: unknown): Promise<FinanceResult> {
  const p = consentSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("set_sms_consent", { p_contact_id: p.data.contactId, p_consent: p.data.consent, p_source: p.data.source });
  if (error) return mapFinanceError(error);
  return { ok: true };
}
