import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { crewMeSchema, crewVisitDetailSchema, crewVisitSchema, type CrewVisit, type CrewVisitDetail } from "@/lib/schemas/crew";

export type CrewHome = { me: { displayName: string; coiExpiresOn: string | null }; visits: CrewVisit[] };

/** Today and the next two weeks, plus the cleaner's own name and insurance expiry. */
export async function loadCrewHome(supabase: SupabaseClient<Database>): Promise<CrewHome> {
  const [visitsRes, meRes] = await Promise.all([supabase.rpc("crew_visits"), supabase.rpc("crew_me")]);
  if (visitsRes.error) throw new Error(`Loading your visits failed: ${visitsRes.error.message}`);
  if (meRes.error) throw new Error(`Loading your profile failed: ${meRes.error.message}`);
  const me = z.array(crewMeSchema).parse(meRes.data)[0];
  return { me: { displayName: me?.display_name ?? "", coiExpiresOn: me?.coi_expires_on ?? null }, visits: z.array(crewVisitSchema).parse(visitsRes.data) };
}

export type Photo = { id: string; kind: "before" | "after" | "issue"; url: string | null };

export type CrewVisitPage = { visit: CrewVisitDetail; photos: Photo[] } | null;

/** One visit with its checklist and photos (signed links, valid for an hour); null if it isn't theirs. */
export async function loadCrewVisit(supabase: SupabaseClient<Database>, jobId: string): Promise<CrewVisitPage> {
  const { data, error } = await supabase.rpc("crew_visit_detail", { p_job_id: jobId });
  if (error) {
    if (error.code === "42501") return null;
    throw new Error(`Loading the visit failed: ${error.message}`);
  }
  const visit = crewVisitDetailSchema.parse(data);
  const { data: rows, error: photoError } = await supabase.from("job_photos").select("id, kind, storage_path").eq("job_id", jobId).order("created_at");
  if (photoError) throw new Error(`Loading photos failed: ${photoError.message}`);
  const signed = rows?.length ? await supabase.storage.from("job-photos").createSignedUrls(rows.map((r) => r.storage_path), 3600) : { data: [] };
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return { visit, photos: (rows ?? []).map((r) => ({ id: r.id, kind: r.kind, url: urls.get(r.storage_path) ?? null })) };
}
