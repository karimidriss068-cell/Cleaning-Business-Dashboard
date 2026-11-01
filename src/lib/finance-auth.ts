import "server-only";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user and whether they are an owner/admin. Null when nobody is signed in. */
export async function financeContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  return { supabase, user, role: data?.role ?? null, isAdmin: data?.role === "owner" || data?.role === "admin" };
}
