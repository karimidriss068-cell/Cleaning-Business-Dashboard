"use server";

import { createClient } from "@/lib/supabase/server";
import {
  completeVisitSchema,
  mapCompleteError,
  registerPhotoSchema,
  saveNoteSchema,
  toggleChecklistSchema,
  type CompleteResult,
} from "@/lib/schemas/crew";

type Result = { ok: true } | { ok: false; message: string };

// Every action runs as the signed-in cleaner, so RLS and the functions' own
// assignment checks apply; none of them can touch another cleaner's visit.

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function toggleChecklistItem(input: unknown): Promise<Result> {
  const parsed = toggleChecklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid task" };
  const { supabase, user } = await session();
  if (!user) return { ok: false, message: "Not signed in" };
  const { error } = await supabase.rpc("set_checklist_item", { p_item_id: parsed.data.itemId, p_done: parsed.data.done });
  return error ? { ok: false, message: error.code === "P0001" ? "This visit is no longer open." : "Couldn't update that task." } : { ok: true };
}

export async function saveVisitNote(input: unknown): Promise<Result> {
  const parsed = saveNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That note is too long (2000 characters max)." };
  const { supabase, user } = await session();
  if (!user) return { ok: false, message: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("subcontractor_id").eq("user_id", user.id).maybeSingle();
  if (!profile?.subcontractor_id) return { ok: false, message: "Only crew members can add visit notes." };
  const { error } = await supabase
    .from("job_cleaner_notes")
    .upsert({ job_id: parsed.data.jobId, subcontractor_id: profile.subcontractor_id, note: parsed.data.note }, { onConflict: "job_id,subcontractor_id" });
  return error ? { ok: false, message: "Couldn't save your note." } : { ok: true };
}

/** Records a photo the browser already uploaded to the private bucket (RLS limits both to the assigned cleaner). */
export async function registerPhoto(input: unknown): Promise<Result> {
  const parsed = registerPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid photo" };
  const { supabase, user } = await session();
  if (!user) return { ok: false, message: "Not signed in" };
  // The file must really be in the bucket (and visible to this cleaner) before it's recorded.
  const { error: seenError } = await supabase.storage.from("job-photos").createSignedUrl(parsed.data.path, 60);
  if (seenError) return { ok: false, message: "The upload didn't finish. Try again." };
  const { error } = await supabase
    .from("job_photos")
    .insert({ job_id: parsed.data.jobId, storage_path: parsed.data.path, kind: parsed.data.kind, uploaded_by: user.id, taken_at: new Date().toISOString() });
  return error ? { ok: false, message: "Couldn't save the photo." } : { ok: true };
}

export async function completeVisit(input: unknown): Promise<CompleteResult> {
  const parsed = completeVisitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "error", message: "Invalid visit" };
  const { supabase, user } = await session();
  if (!user) return { ok: false, code: "forbidden", message: "Not signed in" };
  const { error } = await supabase.rpc("complete_job", { p_job_id: parsed.data.jobId });
  return error ? mapCompleteError(error) : { ok: true };
}
