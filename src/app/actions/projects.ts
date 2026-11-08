"use server";

import { revalidatePath } from "next/cache";
import { financeContext } from "@/lib/finance-auth";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import {
  assignDaySchema, assignmentPaySchema, createProjectSchema, deleteCostSchema, projectCostSchema, projectInvoiceSchema, projectStatusSchema, workDaySchema,
} from "@/lib/schemas/projects";

// Projects. Owner and admin only: every database function refuses anyone else and logs the change.
// Work days are scheduled and staffed here; the invoices they bill through are the ordinary invoices.

const first = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Check the form";
function refresh(projectId?: string) {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/invoices");
  revalidatePath("/schedule");
}

export async function createProject(input: unknown): Promise<FinanceResult<{ projectId: string }>> {
  const p = createProjectSchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("create_project_from_bid", {
    p_bid_id: p.data.bidId, p_expected_updated_at: p.data.expectedUpdatedAt, p_title: p.data.title, p_deposit_bps: p.data.depositBps, p_starts_on: p.data.startsOn, p_ends_on: p.data.endsOn,
  });
  if (error) return mapFinanceError(error);
  const out = data as { project_id: string };
  refresh(out.project_id);
  revalidatePath(`/bids/${p.data.bidId}`);
  revalidatePath("/leads");
  return { ok: true, projectId: out.project_id };
}

export async function setProjectStatus(input: unknown): Promise<FinanceResult> {
  const p = projectStatusSchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("set_project_status", { p_project_id: p.data.projectId, p_status: p.data.status, p_expected_updated_at: p.data.expectedUpdatedAt });
  if (error) return mapFinanceError(error);
  refresh(p.data.projectId);
  return { ok: true };
}

export async function createProjectInvoice(input: unknown): Promise<FinanceResult<{ invoiceId: string }>> {
  const p = projectInvoiceSchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("create_project_invoice", { p_project_id: p.data.projectId, p_milestone: p.data.milestone, p_amount_cents: p.data.amountCents });
  if (error) return mapFinanceError(error);
  refresh(p.data.projectId);
  return { ok: true, invoiceId: String(data) };
}

export async function scheduleWorkDay(input: unknown): Promise<FinanceResult> {
  const p = workDaySchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("schedule_project_day", { p_project_id: p.data.projectId, p_start: p.data.start, p_end: p.data.end, p_notes: p.data.notes });
  if (error) return mapFinanceError(error);
  refresh(p.data.projectId);
  return { ok: true };
}

export async function assignWorkDay(input: unknown): Promise<FinanceResult> {
  const projectId = typeof input === "object" && input !== null && "projectId" in input ? String((input as { projectId: unknown }).projectId) : undefined;
  const p = assignDaySchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("assign_project_day", {
    p_job_id: p.data.jobId, p_expected_updated_at: p.data.expectedUpdatedAt, p_subcontractor_ids: p.data.subcontractorIds, p_pay_cents: p.data.payCents, p_override_reason: p.data.overrideReason,
  });
  // KC002 is the schedule's own refusal (double booking, expired insurance, an inactive cleaner): its message names the problem.
  if (error?.code === "KC002") return { ok: false, code: "not_allowed", message: `${error.message}. Add a reason below to assign anyway.` };
  if (error) return mapFinanceError(error);
  refresh(projectId);
  return { ok: true };
}

export async function setAssignmentPay(input: unknown): Promise<FinanceResult> {
  const projectId = typeof input === "object" && input !== null && "projectId" in input ? String((input as { projectId: unknown }).projectId) : undefined;
  const p = assignmentPaySchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("set_assignment_pay", { p_assignment_id: p.data.assignmentId, p_pay_cents: p.data.payCents });
  if (error) return mapFinanceError(error);
  refresh(projectId);
  return { ok: true };
}

export async function recordProjectCost(input: unknown): Promise<FinanceResult> {
  const p = projectCostSchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("record_project_cost", { p_project_id: p.data.projectId, p_category: p.data.category, p_amount_cents: p.data.amountCents, p_date: p.data.date, p_description: p.data.description ?? "" });
  if (error) return mapFinanceError(error);
  refresh(p.data.projectId);
  revalidatePath("/growth");
  return { ok: true };
}

export async function deleteProjectCost(input: unknown): Promise<FinanceResult> {
  const projectId = typeof input === "object" && input !== null && "projectId" in input ? String((input as { projectId: unknown }).projectId) : undefined;
  const p = deleteCostSchema.safeParse(input);
  if (!p.success) return invalid(first(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_project_cost", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  refresh(projectId);
  revalidatePath("/growth");
  return { ok: true };
}
