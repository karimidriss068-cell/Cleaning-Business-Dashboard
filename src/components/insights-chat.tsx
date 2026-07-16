"use client";

import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  askInsights,
  listInsightsSessions,
  loadInsightsSession,
  dismissDigestFinding,
  togglePin,
  listPinnedMessageIds,
  listPinnedMessages,
  type InsightsAnswer,
  type SessionSummary,
  type StoredMessage,
  type DigestItem,
  type PinnedMessage,
} from "@/app/(app)/insights/actions";
import { Button } from "@/components/ui/button";
import { UsageRing } from "@/components/usage-ring";
import {
  Sparkles,
  ArrowUp,
  CircleAlert,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Pin,
  PinOff,
} from "lucide-react";

const SUGGESTIONS = [
  "Which account is at risk?",
  "What's my top-spending account?",
  "Which creative should I scale?",
  "How does my outreach volume compare to what's converting?",
];

type Exchange =
  | { q: string; kind: "answer"; result: InsightsAnswer; messageId: string | null }
  | { q: string; kind: "limited"; used: number; cap: number };

const ENTER = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

type Entity = InsightsAnswer["mentioned_entities"][number];

const ENTITY_ROUTE: Record<Entity["type"], (id: string) => string> = {
  account: (id) => `/accounts/${id}`,
  campaign: (id) => `/campaigns/${id}`,
  script: (id) => `/outreach/${id}`,
  creative: () => `/creatives`,
};

// Main app nav sidebar (src/app/(app)/layout.tsx) is a fixed w-60 (240px)
// column on desktop; the history sidebar sits immediately after it.
const MAIN_NAV_PX = 240;
const HISTORY_PX = 256; // w-64

/** A number/dollar-figure/percentage token, highlighted inline so key stats
 * stand out inside a sentence without being pulled into a separate grid. */
const NUMBER_SPLIT_RE = /(\$?-?\d[\d,]*(?:\.\d+)?%?)/g;
const NUMBER_TEST_RE = /^\$?-?\d[\d,]*(?:\.\d+)?%?$/;

function highlightNumbers(text: string, keyPrefix: string) {
  return text
    .split(NUMBER_SPLIT_RE)
    .filter((seg) => seg !== "")
    .map((seg, i) =>
      NUMBER_TEST_RE.test(seg) ? (
        <span key={`${keyPrefix}-${i}`} className="font-semibold text-cream-rich">
          {seg}
        </span>
      ) : (
        <Fragment key={`${keyPrefix}-${i}`}>{seg}</Fragment>
      ),
    );
}

/** Splits text on any mentioned entity's exact name into plain strings and
 * entity matches, so callers can further process the plain-text remainder
 * (e.g. number highlighting) without touching the entity segments. */
function splitEntities(text: string, entities: Entity[]): (string | Entity)[] {
  const uniqueByName = entities.filter(
    (e, i) => e.name && entities.findIndex((o) => o.name === e.name) === i,
  );
  if (uniqueByName.length === 0) return [text];

  const sorted = [...uniqueByName].sort((a, b) => b.name.length - a.name.length);
  const pattern = sorted.map((e) => e.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "g");

  return text.split(regex).map((part) => sorted.find((e) => e.name === part) ?? part);
}

/** Account/campaign name mentioned inline in prose — a subtle, medium-weight
 * link (soft underline on hover), not a pill/tag. */
function EntityMention({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-[var(--text-primary)] underline decoration-transparent underline-offset-4 transition-colors hover:decoration-[color-mix(in_srgb,var(--accent-primary)_70%,transparent)]"
    >
      {children}
    </Link>
  );
}

function renderInline(text: string, entities: Entity[], keyPrefix: string): React.ReactNode {
  return splitEntities(text, entities).map((part, i) =>
    typeof part === "string" ? (
      <Fragment key={`${keyPrefix}-s-${i}`}>{highlightNumbers(part, `${keyPrefix}-s-${i}`)}</Fragment>
    ) : (
      <EntityMention key={`${keyPrefix}-e-${i}`} href={ENTITY_ROUTE[part.type](part.id)}>
        {part.name}
      </EntityMention>
    ),
  );
}

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };

/** Plain-text -> paragraphs, with a "- " prefixed run of lines promoted to a
 * real list only when the model is genuinely enumerating several items. */
function parseBlocks(text: string): Block[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const blocks: Block[] = [];
  for (const line of lines) {
    if (line.startsWith("- ")) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") {
        last.items.push(line.slice(2).trim());
      } else {
        blocks.push({ type: "ul", items: [line.slice(2).trim()] });
      }
    } else {
      blocks.push({ type: "p", text: line });
    }
  }
  return blocks;
}

/** One AI answer, rendered as flowing prose — no card, no border, no stat
 * grid. Key numbers and entity names get inline emphasis instead of being
 * extracted into separate fields. */
function InsightAnswer({ result }: { result: InsightsAnswer }) {
  const blocks = parseBlocks(result.answer);

  return (
    <div className="max-w-none text-[16px] leading-[1.7] text-[var(--text-primary)]">
      {!result.data_available && (
        <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-[var(--warning)]">
          <CircleAlert className="h-3.5 w-3.5" />
          Not answerable from current data
        </div>
      )}

      {blocks.map((block, i) =>
        block.type === "ul" ? (
          <ul key={i} className="mb-4 list-disc space-y-1.5 pl-5 last:mb-0">
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item, result.mentioned_entities, `${i}-${j}`)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="mb-4 last:mb-0">
            {renderInline(block.text, result.mentioned_entities, `${i}`)}
          </p>
        ),
      )}

      {result.caveat && (
        <p className="mt-2 text-sm text-muted-foreground italic">{result.caveat}</p>
      )}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1 text-sm text-muted-foreground">
      <span>Thinking</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1 w-1 rounded-full bg-current"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </span>
    </div>
  );
}

/** Reconstructs the exchange list from a loaded session's messages. Only
 * consecutive user->assistant pairs are persisted (see actions.ts), so
 * pairing them back up is a straight scan. */
function messagesToExchanges(messages: StoredMessage[]): Exchange[] {
  const exchanges: Exchange[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const next = messages[i + 1];
    if (next?.role !== "assistant") continue;
    exchanges.push({
      q: m.content,
      kind: "answer",
      messageId: next.id,
      result: {
        answer: next.content,
        caveat: next.caveat,
        follow_ups: next.followUps,
        data_available: next.dataAvailable,
        mentioned_entities: next.mentionedEntities,
      },
    });
  }
  return exchanges;
}

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function HistorySidebar({
  open,
  onToggle,
  sessions,
  currentSessionId,
  onSelect,
  onNewChat,
  pinnedMessages,
}: {
  open: boolean;
  onToggle: () => void;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  pinnedMessages: PinnedMessage[];
}) {
  const [tab, setTab] = useState<"chats" | "pinned">("chats");

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 z-30 hidden flex-col border-r border-border bg-[var(--sidebar)] md:flex",
          open ? "w-64" : "w-0 overflow-hidden border-r-0",
        )}
        style={{ left: MAIN_NAV_PX }}
      >
        <div className="flex items-center gap-1 px-3 pt-4 pb-2">
          <button
            onClick={() => setTab("chats")}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors",
              tab === "chats" ? "bg-[var(--bg-surface)] text-cream-rich" : "text-muted-foreground hover:text-[var(--text-primary)]",
            )}
          >
            Chats
          </button>
          <button
            onClick={() => setTab("pinned")}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-medium tracking-[0.1em] uppercase transition-colors",
              tab === "pinned" ? "bg-[var(--bg-surface)] text-cream-rich" : "text-muted-foreground hover:text-[var(--text-primary)]",
            )}
          >
            Pinned
          </button>
          <button
            onClick={onToggle}
            className="ml-auto text-muted-foreground transition-colors hover:text-cream-rich"
            aria-label="Collapse history"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        {tab === "chats" && (
          <button
            onClick={onNewChat}
            className="mx-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
        )}

        <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {tab === "chats" ? (
            sessions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  title={s.title}
                  className={cn(
                    "block w-full truncate rounded-md px-3 py-2 text-left text-[13px] transition-colors",
                    s.id === currentSessionId
                      ? "bg-[var(--bg-surface)] text-cream-rich"
                      : "text-muted-foreground hover:bg-[var(--bg-surface)]/60 hover:text-[var(--text-primary)]",
                  )}
                >
                  <span className="block truncate">{s.title}</span>
                  <span className="block text-[10px] text-muted-foreground/70">
                    {formatSessionDate(s.updatedAt)}
                  </span>
                </button>
              ))
            )
          ) : pinnedMessages.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No pinned answers yet</p>
          ) : (
            pinnedMessages.map((p) => (
              <button
                key={p.id}
                onClick={() => onSelect(p.sessionId)}
                title={p.content}
                className="block w-full truncate rounded-md px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-[var(--bg-surface)]/60 hover:text-[var(--text-primary)]"
              >
                {p.content}
              </button>
            ))
          )}
        </div>
      </aside>

      {!open && (
        <button
          onClick={onToggle}
          aria-label="Open history"
          className="fixed top-5 z-30 hidden rounded-full border border-border bg-[var(--bg-surface)] p-2 text-muted-foreground transition-colors hover:text-cream-rich md:flex"
          style={{ left: MAIN_NAV_PX + 12 }}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

export function InsightsChat({
  configured,
  initialUsage,
  initialDigest,
}: {
  configured: boolean;
  initialUsage: { queryCount: number; cap: number; estimatedCostUsd: number };
  initialDigest?: DigestItem[];
}) {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(initialUsage);
  const [digest, setDigest] = useState<DigestItem[]>(initialDigest ?? []);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshSessions = useCallback(() => {
    listInsightsSessions().then(setSessions);
  }, []);

  const refreshPins = useCallback(() => {
    listPinnedMessageIds().then((ids) => setPinnedIds(new Set(ids)));
    listPinnedMessages().then(setPinnedMessages);
  }, []);

  useEffect(() => {
    refreshSessions();
    refreshPins();
  }, [refreshSessions, refreshPins]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setInput("");
    const res = await askInsights(q, currentSessionId);
    setLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    if (res.sessionId && res.sessionId !== currentSessionId) {
      setCurrentSessionId(res.sessionId);
    }
    if ("limited" in res) {
      setExchanges((prev) => [...prev, { q, kind: "limited", used: res.used, cap: res.cap }]);
      setUsage((prev) => ({ ...prev, queryCount: res.used }));
      return;
    }
    setExchanges((prev) => [...prev, { q, kind: "answer", result: res.result, messageId: res.messageId }]);
    setUsage((prev) => ({ ...prev, queryCount: prev.queryCount + 1 }));
    refreshSessions();
  }

  function togglePinned(messageId: string | null) {
    if (!messageId) return;
    const pinning = !pinnedIds.has(messageId);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (pinning) next.add(messageId);
      else next.delete(messageId);
      return next;
    });
    togglePin(messageId)
      .then(() => refreshPins())
      .catch(() => toast.error("Couldn't update pin."));
  }

  async function selectSession(id: string) {
    if (id === currentSessionId || loading) return;
    const session = await loadInsightsSession(id);
    if (!session) {
      toast.error("Couldn't load that conversation.");
      return;
    }
    setCurrentSessionId(session.id);
    setExchanges(messagesToExchanges(session.messages));
  }

  function startNewChat() {
    if (loading) return;
    setCurrentSessionId(null);
    setExchanges([]);
  }

  function dismissFlag(id: string) {
    setDigest((prev) => prev.filter((d) => d.id !== id));
    dismissDigestFinding(id).catch(() => {
      toast.error("Couldn't dismiss that flag.");
    });
  }

  if (!configured) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-medium">AI insights aren&apos;t configured yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add an <code className="text-primary">ANTHROPIC_API_KEY</code> to your
            environment (get one at console.anthropic.com), then restart. You&apos;ll
            be able to ask plain-English questions about your live data here.
          </p>
        </div>
      </div>
    );
  }

  const contentOffsetClass = historyOpen ? "md:pl-64" : "md:pl-0";
  const inputLeftClass = historyOpen ? "md:left-[31rem]" : "md:left-60";

  return (
    <div className="relative">
      <HistorySidebar
        open={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelect={selectSession}
        onNewChat={startNewChat}
        pinnedMessages={pinnedMessages}
      />

      <div className={cn("transition-[padding] duration-200", contentOffsetClass)}>
        {/* Usage badge — small, top-right, out of the reading flow */}
        <div className="flex justify-end px-6 pt-4 sm:px-10">
          <UsageRing used={usage.queryCount} cap={usage.cap} costUsd={usage.estimatedCostUsd} />
        </div>

        {/* Conversation — scrolls in normal page flow; bottom padding clears the fixed input bar */}
        <div className="mx-auto w-full max-w-[760px] px-6 pt-6 pb-40 sm:px-10">
          {digest.length > 0 && (
            <div className="mb-8 space-y-2 border-b border-border/60 pb-6">
              <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Today&apos;s flags
              </p>
              {digest.map((d) => (
                <div key={d.id} className="flex items-start justify-between gap-3">
                  <p className="flex items-start gap-1.5 text-[14px] leading-relaxed text-[var(--warning)]">
                    <span className="mt-0.5">
                      <CircleAlert className="h-3.5 w-3.5" />
                    </span>
                    <span>{d.message}</span>
                  </p>
                  <button
                    onClick={() => dismissFlag(d.id)}
                    aria-label="Dismiss"
                    className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-cream-rich"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {exchanges.length === 0 && !loading ? (
            <div className="pt-10">
              <p className="mb-4 text-[15px] text-muted-foreground">
                Ask anything about your live data. Try:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-full border border-border px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {exchanges.map((ex, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={ENTER}
                  className="group space-y-3"
                >
                  {/* User message — plain, right-aligned, secondary */}
                  <p className="ml-auto w-fit max-w-[80%] rounded-2xl bg-[var(--bg-surface)]/50 px-4 py-2 text-right text-[14px] text-[var(--text-muted)]">
                    {ex.q}
                  </p>

                  {ex.kind === "limited" ? (
                    <p className="flex items-start gap-1.5 text-[15px] text-[var(--warning)]">
                      <span className="mt-0.5">
                        <CircleAlert className="h-4 w-4" />
                      </span>
                      You&apos;ve used {ex.used} of {ex.cap} queries this month — the
                      limit resets at the start of next calendar month.
                    </p>
                  ) : (
                    <>
                      <div className="relative">
                        <InsightAnswer result={ex.result} />
                        {ex.messageId && (
                          <button
                            onClick={() => togglePinned(ex.messageId)}
                            aria-label={pinnedIds.has(ex.messageId) ? "Unpin" : "Pin"}
                            className={cn(
                              "absolute top-0 -right-1 text-muted-foreground opacity-0 transition-opacity hover:text-cream-rich group-hover:opacity-100",
                              pinnedIds.has(ex.messageId) && "text-cream-rich opacity-100",
                            )}
                          >
                            {pinnedIds.has(ex.messageId) ? (
                              <PinOff className="h-3.5 w-3.5" />
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                      {!!ex.result.follow_ups?.length && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ex.result.follow_ups.map((f) => (
                            <button
                              key={f}
                              onClick={() => ask(f)}
                              disabled={loading}
                              className="rounded-full border border-border px-3.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich disabled:opacity-50"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              ))}
              {loading && <ThinkingIndicator />}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input — fixed to the bottom of the viewport, offset past the sidebar(s) on desktop */}
        <div className={cn("fixed inset-x-0 bottom-0 z-20 transition-[left] duration-200", inputLeftClass)}>
          <div className="bg-gradient-to-t from-background via-background/95 to-transparent px-6 pt-8 pb-6 sm:px-10">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="mx-auto flex w-full max-w-[760px] items-center gap-2 rounded-full border border-border bg-[var(--bg-surface)] px-4 py-2 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.6)]"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your data…"
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-muted-foreground"
                disabled={loading}
              />
              <Button
                type="submit"
                size="icon-sm"
                loading={loading}
                disabled={!input.trim()}
                className="rounded-full transition-shadow hover:shadow-[0_0_16px_2px_color-mix(in_srgb,var(--accent-bright)_55%,transparent)]"
              >
                {!loading && <ArrowUp className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
