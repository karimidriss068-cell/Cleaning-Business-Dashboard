import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type SpaceSummary = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  contextNotes: string | null;
  createdAt: string;
};

export async function listSpaces(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SpaceSummary[]> {
  const { data } = await supabase
    .from("insights_spaces")
    .select("id, name, account_id, context_notes, created_at, account:accounts(name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    accountId: s.account_id,
    accountName: (s.account as { name: string } | null)?.name ?? null,
    contextNotes: s.context_notes,
    createdAt: s.created_at,
  }));
}

export async function createSpace(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { name: string; accountId: string | null; contextNotes: string | null },
): Promise<string> {
  const { data, error } = await supabase
    .from("insights_spaces")
    .insert({
      user_id: userId,
      name: input.name,
      account_id: input.accountId,
      context_notes: input.contextNotes,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create space");
  return data.id;
}

export async function updateSpaceNotes(
  supabase: SupabaseClient<Database>,
  userId: string,
  spaceId: string,
  contextNotes: string,
): Promise<void> {
  await supabase
    .from("insights_spaces")
    .update({ context_notes: contextNotes })
    .eq("id", spaceId)
    .eq("user_id", userId);
}

/** For the AI system prompt / data-snapshot scoping — not exposed directly
 * to the UI (listSpaces already carries what the sidebar needs). */
export async function getSpace(
  supabase: SupabaseClient<Database>,
  userId: string,
  spaceId: string,
): Promise<{ id: string; name: string; accountId: string | null; contextNotes: string | null } | null> {
  const { data } = await supabase
    .from("insights_spaces")
    .select("id, name, account_id, context_notes")
    .eq("id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, accountId: data.account_id, contextNotes: data.context_notes };
}
