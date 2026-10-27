import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/config/navigation";

/** The signed-in member and their profile, read once per request. */
export const getMember = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, supabase };
  const { data } = await supabase.from("profiles").select("full_name, role, subcontractor_id").eq("user_id", user.id).maybeSingle();
  return { user, profile: data ? { fullName: data.full_name, role: data.role as MemberRole, subcontractorId: data.subcontractor_id } : null, supabase };
});
