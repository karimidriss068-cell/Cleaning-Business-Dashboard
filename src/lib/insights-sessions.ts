import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { InsightsAnswer } from "@/lib/insights-ask";

export type SessionSummary = { id: string; title: string; updatedAt: string };

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  caveat: string | null;
  dataAvailable: boolean;
  mentionedEntities: InsightsAnswer["mentioned_entities"];
  followUps: string[];
};

export type SessionWithMessages = {
  id: string;
  title: string;
  messages: StoredMessage[];
};

const TITLE_MAX_LEN = 60;

function titleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  return trimmed.length > TITLE_MAX_LEN
    ? trimmed.slice(0, TITLE_MAX_LEN - 1).trimEnd() + "…"
    : trimmed;
}

/** Sessions belonging to the caller, most recently active first. RLS already
 * restricts rows to the caller's own via auth.uid(), the .eq() here is just
 * belt-and-suspenders on top of that. */
export async function listSessions(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from("insights_sessions")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data.map((s) => ({ id: s.id, title: s.title ?? "New chat", updatedAt: s.updated_at }));
}

export async function getSession(
  supabase: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<SessionWithMessages | null> {
  const { data: session } = await supabase
    .from("insights_sessions")
    .select("id, title")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return null;

  const { data: messages } = await supabase
    .from("insights_messages")
    .select("id, role, content, caveat, data_available, mentioned_entities, follow_ups")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return {
    id: session.id,
    title: session.title ?? "New chat",
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      caveat: m.caveat,
      dataAvailable: m.data_available,
      mentionedEntities: (m.mentioned_entities as InsightsAnswer["mentioned_entities"] | null) ?? [],
      followUps: (m.follow_ups as string[] | null) ?? [],
    })),
  };
}

export async function createSession(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("insights_sessions")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create session");
  return data.id;
}

/** Appends the user's question, bumps the session's updated_at (for sidebar
 * ordering), and — only on the session's first message — derives the title
 * from it, the same way Claude auto-titles a new chat. */
export async function appendUserMessage(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  content: string,
): Promise<void> {
  await supabase.from("insights_messages").insert({ session_id: sessionId, role: "user", content });
  await supabase
    .from("insights_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  await supabase
    .from("insights_sessions")
    .update({ title: titleFromQuestion(content) })
    .eq("id", sessionId)
    .is("title", null);
}

export async function appendAssistantMessage(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  answer: InsightsAnswer,
  followUps: string[] = [],
): Promise<string | null> {
  const { data, error } = await supabase
    .from("insights_messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: answer.answer,
      caveat: answer.caveat,
      data_available: answer.data_available,
      mentioned_entities: answer.mentioned_entities as unknown as Json,
      follow_ups: followUps as unknown as Json,
    })
    .select("id")
    .single();
  await supabase
    .from("insights_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error || !data) return null;
  return data.id;
}
