"use server";

import { revalidatePath } from "next/cache";
import { financeContext } from "@/lib/finance-auth";
import {
  MAX_W9_BYTES,
  W9_TYPES,
  buildPayoutsSchema,
  documentIdSchema,
  invalid,
  mapFinanceError,
  markPayoutPaidSchema,
  notSignedIn,
  payoutIdSchema,
  payoutVersionSchema,
  settingsFormSchema,
  voidPayoutSchema,
  w9Schema,
  type FinanceResult,
} from "@/lib/schemas/finance";
import type { z } from "zod";

// Payouts are RECORDED here, never sent: the owner pays by Zelle/ACH/check
// outside the app and marks the batch paid with a reference. No money moves.

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";
function refresh() {
  revalidatePath("/payouts");
  revalidatePath("/command-center");
}

export async function buildPayouts(input: unknown): Promise<FinanceResult<{ built: number; skipped: number }>> {
  const p = buildPayoutsSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("build_payout_drafts", { p_week_start: p.data.weekStart, p_subcontractor_id: p.data.subcontractorId as string });
  if (error) return mapFinanceError(error);
  const out = data as { built?: number; skipped?: number } | null;
  refresh();
  return { ok: true, built: out?.built ?? 0, skipped: out?.skipped ?? 0 };
}

export async function approvePayout(input: unknown): Promise<FinanceResult<{ updatedAt: string }>> {
  const p = payoutVersionSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("approve_payout", { p_payout_id: p.data.payoutId, p_expected_updated_at: p.data.expectedUpdatedAt });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true, updatedAt: data };
}

export async function reopenPayout(input: unknown): Promise<FinanceResult> {
  const p = payoutIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("reopen_payout", { p_payout_id: p.data.payoutId });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function markPayoutPaid(input: unknown): Promise<FinanceResult> {
  const p = markPayoutPaidSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("mark_payout_paid", {
    p_payout_id: p.data.payoutId,
    p_method: p.data.method,
    p_reference: p.data.reference,
    p_paid_on: p.data.paidOn as string,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function voidPayout(input: unknown): Promise<FinanceResult> {
  const p = voidPayoutSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("void_payout", { p_payout_id: p.data.payoutId, p_reason: p.data.reason });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function deletePayoutDraft(input: unknown): Promise<FinanceResult> {
  const p = payoutIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_payout_draft", { p_payout_id: p.data.payoutId });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

// W-9s -----------------------------------------------------------------------------

/** Uploads a W-9 to the private bucket (owner/admin only; it holds a TIN) and records it. */
export async function uploadW9(formData: FormData): Promise<FinanceResult> {
  const p = w9Schema.safeParse({ subcontractorId: formData.get("subcontractorId") });
  if (!p.success) return invalid(firstIssue(p.error));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return invalid("Choose a file to upload");
  const ext = W9_TYPES[file.type];
  if (!ext) return invalid("Upload a PDF, JPG or PNG");
  if (file.size > MAX_W9_BYTES) return invalid("That file is over 10 MB");
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return { ok: false, code: "forbidden", message: "Only the owner or an admin can upload W-9s." };
  const path = `${p.data.subcontractorId}/w9-${Date.now()}.${ext}`;
  const up = await ctx.supabase.storage.from("subcontractor-documents").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, code: "error", message: "The upload didn't go through. Try again." };
  const { error } = await ctx.supabase.rpc("record_w9", { p_subcontractor_id: p.data.subcontractorId, p_storage_path: path });
  if (error) {
    await ctx.supabase.storage.from("subcontractor-documents").remove([path]);
    return mapFinanceError(error);
  }
  refresh();
  return { ok: true };
}

export async function removeW9(input: unknown): Promise<FinanceResult> {
  const p = documentIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("remove_subcontractor_document", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  await ctx.supabase.storage.from("subcontractor-documents").remove([data]);
  refresh();
  return { ok: true };
}

/** A short-lived link to view a W-9 (owner/admin only). */
export async function w9ViewUrl(input: unknown): Promise<FinanceResult<{ url: string }>> {
  const p = documentIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return { ok: false, code: "forbidden", message: "Only the owner or an admin can open W-9s." };
  const { data: doc } = await ctx.supabase.from("subcontractor_documents").select("storage_path, type").eq("id", p.data.id).maybeSingle();
  if (!doc || doc.type !== "w9") return invalid("Document not found");
  const { data, error } = await ctx.supabase.storage.from("subcontractor-documents").createSignedUrl(doc.storage_path, 60);
  if (error || !data) return { ok: false, code: "error", message: "Couldn't open that file." };
  return { ok: true, url: data.signedUrl };
}

// Settings --------------------------------------------------------------------------

export async function updateFinanceSettings(input: unknown): Promise<FinanceResult> {
  const p = settingsFormSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("update_business_settings", {
    p_tax_rate_ppm: p.data.taxRate,
    p_default_line_taxable: p.data.defaultLineTaxable,
    p_invoice_due_days: p.data.invoiceDueDays,
    p_threshold_cents: p.data.thresholdCents,
    p_warn_bps: p.data.warnPercent * 100,
  });
  if (error) return mapFinanceError(error);
  revalidatePath("/settings");
  refresh();
  return { ok: true };
}
