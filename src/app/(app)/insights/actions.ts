"use server";

import { createClient } from "@/lib/supabase/server";
import { askInsightsCore, type InsightsAnswer } from "@/lib/insights-ask";
import {
  createSession,
  appendUserMessage,
  appendAssistantMessage,
  listSessions,
  getSession,
  type SessionSummary,
  type SessionWithMessages,
} from "@/lib/insights-sessions";
import {
  getTodaysDigest,
  dismissDigestFinding as dismissDigestFindingCore,
  type DigestItem,
} from "@/lib/insights-digest";
import {
  togglePin as togglePinCore,
  listPinnedMessageIds as listPinnedMessageIdsCore,
  listPinnedMessages as listPinnedMessagesCore,
  type PinnedMessage,
} from "@/lib/insights-pins";

export type { InsightsAnswer } from "@/lib/insights-ask";
export type { SessionSummary, SessionWithMessages, StoredMessage } from "@/lib/insights-sessions";
export type { DigestItem } from "@/lib/insights-digest";
export type { PinnedMessage } from "@/lib/insights-pins";

export type AskInsightsPageResult =
  | { result: InsightsAnswer; sessionId: string; messageId: string | null }
  | { limited: true; used: number; cap: number; sessionId: string | null }
  | { error: string; sessionId: string | null };

/**
 * Runs a question through the shared insights logic, then — only for a real
 * answer (not an error or a monthly-limit decline) — persists the Q&A pair
 * to insights_sessions/insights_messages. Lazily creates a session on the
 * first question of a new conversation (sessionId null) rather than on
 * "New chat" click, so an unused new-chat slot never clutters the sidebar.
 */
export async function askInsights(
  question: string,
  sessionId: string | null,
): Promise<AskInsightsPageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", sessionId };

  const outcome = await askInsightsCore(supabase, { id: user.id, email: user.email ?? "unknown" }, question);

  if ("error" in outcome) return { error: outcome.error, sessionId };
  if ("limited" in outcome) return { limited: true, used: outcome.used, cap: outcome.cap, sessionId };

  const activeSessionId = sessionId ?? (await createSession(supabase, user.id));
  await appendUserMessage(supabase, activeSessionId, question);
  const messageId = await appendAssistantMessage(
    supabase,
    activeSessionId,
    outcome.result,
    outcome.result.follow_ups ?? [],
  );

  return { result: outcome.result, sessionId: activeSessionId, messageId };
}

export async function listInsightsSessions(): Promise<SessionSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listSessions(supabase, user.id);
}

export async function loadInsightsSession(sessionId: string): Promise<SessionWithMessages | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return getSession(supabase, user.id, sessionId);
}

export async function listTodaysDigest(): Promise<DigestItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return getTodaysDigest(supabase, user.id);
}

export async function dismissDigestFinding(digestId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await dismissDigestFindingCore(supabase, user.id, digestId);
}

export async function togglePin(messageId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return togglePinCore(supabase, user.id, messageId);
}

export async function listPinnedMessageIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listPinnedMessageIdsCore(supabase, user.id);
}

export async function listPinnedMessages(): Promise<PinnedMessage[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listPinnedMessagesCore(supabase, user.id);
}
