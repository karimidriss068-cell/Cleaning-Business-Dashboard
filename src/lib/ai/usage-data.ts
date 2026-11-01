import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { aiSummarySchema, type AiSummary } from "@/lib/ai/budget";

/** The spend summary for owner/admin; null for anyone else or if the database is unavailable. */
export async function loadAiSummary(supabase: SupabaseClient<Database>): Promise<AiSummary | null> {
  const { data, error } = await supabase.rpc("ai_usage_summary");
  if (error) return null;
  const parsed = aiSummarySchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Which provider keys are set (names only, never values), for the page. */
export function aiKeyStatus() {
  return { anthropic: Boolean(process.env["CLEANING_ANTHROPIC_API_KEY"]), xai: Boolean(process.env["XAI_API_KEY"]) };
}
