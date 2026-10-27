"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mapReassignError, reassignInputSchema, type ReassignResult } from "@/lib/schemas/dispatch";

/**
 * Moves a visit via reassign_job as the signed-in member (RLS and the
 * database's rules apply; an admin override needs a reason, which the
 * function logs). The client updates optimistically and rolls back on a
 * non-ok result.
 */
export async function reassignVisit(input: unknown): Promise<ReassignResult> {
  const parsed = reassignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid move" };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "forbidden", message: "Not signed in" };

  const { data, error } = await supabase.rpc("reassign_job", {
    p_job_id: v.jobId,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_crew_id: v.crewId as string,
    p_subcontractor_ids: v.subcontractorIds,
    p_start: v.start,
    p_end: v.end,
    p_override_reason: v.overrideReason as string,
  });
  if (error) return mapReassignError(error);
  revalidatePath("/schedule");
  return { ok: true, updatedAt: String(data) };
}
