import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { InsightsAnswer } from "@/lib/insights-ask";

export type ReportItem = {
  id: string;
  content: string;
  caveat: string | null;
  mentionedEntities: InsightsAnswer["mentioned_entities"];
  followUps: string[];
  createdAt: string;
};

export async function listReports(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ReportItem[]> {
  const { data } = await supabase
    .from("insights_reports")
    .select("id, content, caveat, mentioned_entities, follow_ups, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    content: r.content,
    caveat: r.caveat,
    mentionedEntities: (r.mentioned_entities as InsightsAnswer["mentioned_entities"] | null) ?? [],
    followUps: (r.follow_ups as string[] | null) ?? [],
    createdAt: r.created_at,
  }));
}

export async function saveReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  spaceId: string | null,
  answer: InsightsAnswer,
): Promise<ReportItem | null> {
  const { data, error } = await supabase
    .from("insights_reports")
    .insert({
      user_id: userId,
      space_id: spaceId,
      content: answer.answer,
      caveat: answer.caveat,
      mentioned_entities: answer.mentioned_entities as unknown as Json,
      follow_ups: (answer.follow_ups ?? []) as unknown as Json,
    })
    .select("id, content, caveat, mentioned_entities, follow_ups, created_at")
    .single();
  if (error || !data) return null;

  return {
    id: data.id,
    content: data.content,
    caveat: data.caveat,
    mentionedEntities: (data.mentioned_entities as InsightsAnswer["mentioned_entities"] | null) ?? [],
    followUps: (data.follow_ups as string[] | null) ?? [],
    createdAt: data.created_at,
  };
}
