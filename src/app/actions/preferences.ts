"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  DIRECTION_COOKIE,
  DIRECTION_COOKIE_MAX_AGE,
  defaultPreferences,
  preferencesSchema,
  preferencesUpdateSchema,
  type Preferences,
} from "@/lib/theme/preferences";

export type SavePreferencesResult = { ok: true; preferences: Preferences } | { ok: false; error: string };

/**
 * Saves the signed-in member's appearance (own row, RLS-enforced) and mirrors
 * the direction into a cookie so the next server render paints it directly.
 */
export async function savePreferences(input: unknown): Promise<SavePreferencesResult> {
  const parsed = preferencesUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid appearance choice" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: current, error: readError } = await supabase
    .from("user_preferences")
    .select("direction, theme")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { ok: false, error: "Couldn't read your saved appearance" };

  const base = preferencesSchema.safeParse(current);
  const next: Preferences = { ...(base.success ? base.data : defaultPreferences), ...parsed.data };

  const { error } = await supabase.from("user_preferences").upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
  if (error) return { ok: false, error: "Couldn't save your appearance" };

  (await cookies()).set(DIRECTION_COOKIE, next.direction, { path: "/", maxAge: DIRECTION_COOKIE_MAX_AGE, sameSite: "lax" });
  return { ok: true, preferences: next };
}
