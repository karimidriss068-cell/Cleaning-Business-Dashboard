import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type PinnedMessage = {
  id: string; // pin id
  messageId: string;
  sessionId: string;
  content: string;
  pinnedAt: string;
};

export async function listPinnedMessageIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase.from("insights_pins").select("message_id").eq("user_id", userId);
  return (data ?? []).map((p) => p.message_id);
}

/** Toggles a pin for the given message and returns the new pinned state. */
export async function togglePin(
  supabase: SupabaseClient<Database>,
  userId: string,
  messageId: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("insights_pins")
    .select("id")
    .eq("user_id", userId)
    .eq("message_id", messageId)
    .maybeSingle();

  if (existing) {
    await supabase.from("insights_pins").delete().eq("id", existing.id);
    return false;
  }
  await supabase.from("insights_pins").insert({ user_id: userId, message_id: messageId });
  return true;
}

export async function listPinnedMessages(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PinnedMessage[]> {
  const { data: pins } = await supabase
    .from("insights_pins")
    .select("id, message_id, pinned_at")
    .eq("user_id", userId)
    .order("pinned_at", { ascending: false });
  if (!pins || pins.length === 0) return [];

  const { data: messages } = await supabase
    .from("insights_messages")
    .select("id, content, session_id")
    .in(
      "id",
      pins.map((p) => p.message_id),
    );
  const messageById = new Map((messages ?? []).map((m) => [m.id, m]));

  return pins
    .map((p) => {
      const m = messageById.get(p.message_id);
      if (!m) return null;
      return { id: p.id, messageId: m.id, sessionId: m.session_id, content: m.content, pinnedAt: p.pinned_at };
    })
    .filter((x): x is PinnedMessage => x !== null);
}
