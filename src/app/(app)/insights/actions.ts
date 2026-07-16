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
import {
  listSpaces as listSpacesCore,
  createSpace as createSpaceCore,
  updateSpaceNotes as updateSpaceNotesCore,
  getSpace,
  type SpaceSummary,
} from "@/lib/insights-spaces";
import { listReports as listReportsCore, saveReport, type ReportItem } from "@/lib/insights-reports";

export type { InsightsAnswer } from "@/lib/insights-ask";
export type { SessionSummary, SessionWithMessages, StoredMessage } from "@/lib/insights-sessions";
export type { DigestItem } from "@/lib/insights-digest";
export type { PinnedMessage } from "@/lib/insights-pins";
export type { SpaceSummary } from "@/lib/insights-spaces";
export type { ReportItem } from "@/lib/insights-reports";

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
 *
 * `spaceId`, if set, both scopes the question (account context + persistent
 * notes injected into the system prompt) and tags a newly-created session to
 * that Space so its history stays separate from general chats.
 */
export async function askInsights(
  question: string,
  sessionId: string | null,
  spaceId: string | null = null,
): Promise<AskInsightsPageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", sessionId };

  const space = spaceId ? await getSpace(supabase, user.id, spaceId) : null;

  const outcome = await askInsightsCore(
    supabase,
    { id: user.id, email: user.email ?? "unknown" },
    question,
    space ? { space: { name: space.name, accountId: space.accountId, contextNotes: space.contextNotes } } : undefined,
  );

  if ("error" in outcome) return { error: outcome.error, sessionId };
  if ("limited" in outcome) return { limited: true, used: outcome.used, cap: outcome.cap, sessionId };

  const activeSessionId = sessionId ?? (await createSession(supabase, user.id, spaceId));
  await appendUserMessage(supabase, activeSessionId, question);
  const messageId = await appendAssistantMessage(
    supabase,
    activeSessionId,
    outcome.result,
    outcome.result.follow_ups ?? [],
  );

  return { result: outcome.result, sessionId: activeSessionId, messageId };
}

export async function listInsightsSessions(spaceId: string | null = null): Promise<SessionSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listSessions(supabase, user.id, spaceId);
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

export async function listInsightsSpaces(): Promise<SpaceSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listSpacesCore(supabase, user.id);
}

export async function createInsightsSpace(input: {
  name: string;
  accountId: string | null;
  contextNotes: string | null;
}): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return createSpaceCore(supabase, user.id, input);
}

export async function updateInsightsSpaceNotes(spaceId: string, contextNotes: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await updateSpaceNotesCore(supabase, user.id, spaceId, contextNotes);
}

/** Minimal account list for the "+ New Space" account picker. Accounts have
 * blanket authenticated-access RLS (same as everywhere else in the app), so
 * this is a plain read, no ownership filtering needed. */
export async function listAccountsForSpacePicker(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select("id, name").order("name");
  return data ?? [];
}

export type RunAnalysisResult = { report: ReportItem } | { limited: true; used: number; cap: number } | { error: string };

/**
 * Analyst Mode — a single larger Claude call producing a full structured
 * report, reusing askInsightsCore's "analysis" mode (same usage cap, same
 * data snapshot/space-scoping, same anti-hallucination system prompt) but
 * persisted to insights_reports instead of a chat session, since a report
 * isn't a conversational turn.
 */
export async function runFullAnalysis(spaceId: string | null = null): Promise<RunAnalysisResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const space = spaceId ? await getSpace(supabase, user.id, spaceId) : null;
  const question = space
    ? `Run a full analysis of the "${space.name}" focus space.`
    : "Run a full analysis of the business.";

  const outcome = await askInsightsCore(
    supabase,
    { id: user.id, email: user.email ?? "unknown" },
    question,
    {
      mode: "analysis",
      space: space ? { name: space.name, accountId: space.accountId, contextNotes: space.contextNotes } : undefined,
    },
  );

  if ("error" in outcome) return { error: outcome.error };
  if ("limited" in outcome) return { limited: true, used: outcome.used, cap: outcome.cap };

  const report = await saveReport(supabase, user.id, spaceId, outcome.result);
  if (!report) return { error: "Analysis generated but couldn't be saved." };

  return { report };
}

export async function listInsightsReports(): Promise<ReportItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return listReportsCore(supabase, user.id);
}
