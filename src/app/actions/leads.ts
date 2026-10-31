"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadTimeline, type TimelineEntry } from "@/lib/leads-data";
import { normalizeEmail, normalizeUsPhone } from "@/lib/leads";
import {
  addNoteSchema,
  convertLeadSchema,
  createLeadSchema,
  duplicateQuerySchema,
  mapLeadError,
  moveLeadSchema,
  parseDuplicates,
  updateLeadSchema,
  type DuplicateMatch,
  type LeadActionResult,
} from "@/lib/schemas/leads";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const invalid = (message: string): Extract<LeadActionResult, { ok: false }> => ({ ok: false, code: "invalid", message });
const notSignedIn: Extract<LeadActionResult, { ok: false }> = { ok: false, code: "forbidden", message: "Not signed in" };

/** Adds a lead (and its contact). Matching phone/email returns the matches unless allowDuplicate is set. */
export async function createLead(input: unknown): Promise<LeadActionResult<{ leadId: string; contactId: string }>> {
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the form");
  const v = parsed.data;
  const { supabase, user } = await signedIn();
  if (!user) return notSignedIn;

  const { data, error } = await supabase.rpc("create_lead", {
    p_first_name: v.firstName,
    p_last_name: v.lastName as string,
    p_phone: v.phone as string,
    p_email: normalizeEmail(v.email) as string,
    p_service_type: v.serviceType,
    p_source: v.source,
    p_borough: v.borough,
    p_address_line1: v.addressLine1 as string,
    p_zip: v.zip as string,
    p_notes: v.notes as string,
    p_next_follow_up_on: v.nextFollowUpOn as string,
    p_allow_duplicate: v.allowDuplicate,
  });
  if (error) return mapLeadError(error);
  const out = data as { lead_id: string; contact_id: string };
  revalidatePath("/leads");
  revalidatePath("/command-center");
  return { ok: true, leadId: out.lead_id, contactId: out.contact_id };
}

/** Live duplicate check for the quick-add form (phone/email as typed). */
export async function findDuplicates(input: unknown): Promise<DuplicateMatch[]> {
  const parsed = duplicateQuerySchema.safeParse(input);
  if (!parsed.success) return [];
  const phone = normalizeUsPhone(parsed.data.phone);
  const email = normalizeEmail(parsed.data.email);
  if (!phone && !email) return [];
  const { supabase, user } = await signedIn();
  if (!user) return [];
  const { data } = await supabase.rpc("find_lead_duplicates", { p_phone: phone as string, p_email: email as string });
  return parseDuplicates(JSON.stringify(data ?? []));
}

export async function moveLead(input: unknown): Promise<LeadActionResult<{ updatedAt: string }>> {
  const parsed = moveLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid move");
  const v = parsed.data;
  if (v.stage === "lost" && !v.lostReason) return invalid("Say briefly why it was lost");
  const { supabase, user } = await signedIn();
  if (!user) return notSignedIn;
  const { data, error } = await supabase.rpc("move_lead_stage", {
    p_lead_id: v.leadId,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_stage: v.stage,
    p_lost_reason: v.lostReason as string,
  });
  if (error) return mapLeadError(error);
  revalidatePath("/leads");
  revalidatePath("/command-center");
  return { ok: true, updatedAt: String(data) };
}

export async function updateLead(input: unknown): Promise<LeadActionResult<{ updatedAt: string }>> {
  const parsed = updateLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Check the form");
  const v = parsed.data;
  const { supabase, user } = await signedIn();
  if (!user) return notSignedIn;
  const { data, error } = await supabase.rpc("update_lead", { p_lead_id: v.leadId, p_expected_updated_at: v.expectedUpdatedAt, p_patch: v.patch });
  if (error) return mapLeadError(error);
  revalidatePath("/leads");
  revalidatePath("/command-center");
  return { ok: true, updatedAt: String(data) };
}

export async function convertLead(input: unknown): Promise<LeadActionResult<{ quoteId: string; quoteNumber: number; already: boolean; updatedAt: string; stage: string }>> {
  const parsed = convertLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid request");
  const v = parsed.data;
  const { supabase, user } = await signedIn();
  if (!user) return notSignedIn;
  const { data, error } = await supabase.rpc("convert_lead", { p_lead_id: v.leadId, p_expected_updated_at: v.expectedUpdatedAt, p_company_name: v.companyName as string });
  if (error) return mapLeadError(error);
  const out = data as { quote_id: string; quote_number: number; already: boolean };
  const { data: lead } = await supabase.from("leads").select("updated_at, stage").eq("id", v.leadId).single();
  revalidatePath("/leads");
  return { ok: true, quoteId: out.quote_id, quoteNumber: Number(out.quote_number), already: out.already, updatedAt: lead?.updated_at ?? v.expectedUpdatedAt, stage: lead?.stage ?? "contacted" };
}

/** Logs a call note, message or note on the lead's timeline. */
export async function addLeadNote(input: unknown): Promise<LeadActionResult> {
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Write something first");
  const v = parsed.data;
  const { supabase, user } = await signedIn();
  if (!user) return notSignedIn;
  const { data: lead, error: leadErr } = await supabase.from("leads").select("contact_id").eq("id", v.leadId).maybeSingle();
  if (leadErr || !lead) return invalid("Lead not found");
  const { error } = await supabase.from("activities").insert({
    type: v.kind,
    direction: v.kind === "note" ? null : (v.direction ?? "outbound"),
    subject: { note: "Note", call: "Call", sms: "Text message", email: "Email" }[v.kind],
    body: v.body,
    lead_id: v.leadId,
    contact_id: lead.contact_id,
    actor_user_id: user.id,
  });
  if (error) return mapLeadError(error);
  revalidatePath("/leads");
  return { ok: true };
}

/** The lead's activity timeline, newest first. */
export async function getLeadTimeline(leadId: string): Promise<TimelineEntry[]> {
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return [];
  const { supabase, user } = await signedIn();
  if (!user) return [];
  return loadTimeline(supabase, leadId);
}
