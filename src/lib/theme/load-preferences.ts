import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { preferencesSchema, type Preferences } from "./preferences";

export type LoadedPreferences = { status: "saved"; preferences: Preferences } | { status: "none" } | { status: "failed" };

/**
 * The member's saved appearance. "none" = no row yet (use the local choice);
 * "failed" = the read failed (fall back to the cookie / localStorage / default).
 */
export async function loadPreferences(supabase: SupabaseClient<Database>, userId: string): Promise<LoadedPreferences> {
  const { data, error } = await supabase.from("user_preferences").select("direction, theme").eq("user_id", userId).maybeSingle();
  if (error) return { status: "failed" };
  if (!data) return { status: "none" };
  const parsed = preferencesSchema.safeParse(data);
  return parsed.success ? { status: "saved", preferences: parsed.data } : { status: "failed" };
}
