"use client";

import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  askInsights,
  listInsightsSessions,
  loadInsightsSession,
  dismissDigestFinding,
  togglePin,
  listPinnedMessageIds,
  listPinnedMessages,
  listInsightsSpaces,
  createInsightsSpace,
  updateInsightsSpaceNotes,
  listAccountsForSpacePicker,
  runFullAnalysis,
  listInsightsReports,
  type InsightsAnswer,
  type SessionSummary,
  type StoredMessage,
  type DigestItem,
  type PinnedMessage,
  type SpaceSummary,
  type ReportItem,
  type PriorityItem,
} from "@/app/(app)/insights/actions";
import { money } from "@/lib/format";
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
  Compass,
  ChevronLeft,
  FileText,
  Target,
} from "lucide-react";

const SUGGESTIONS = [
  "Which account is at risk?",
  "What's my top-spending account?",
  "Which creative should I scale?",
  "How does my outreach volume compare to what's converting?",
];

type Exchange =
  | { q: string; kind: "answer"; result: InsightsAnswer; messageId: string | null }
  | { q: string; kind: "limited"; used: number; cap: number }
  | { kind: "report"; result: InsightsAnswer; createdAt: string };

// Message entrance — the one "functional" motion kept from the last pass,
// tightened to a subtler 150-200ms range per the restraint pass.
const ENTER = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };

// The one orchestrated page-load sequence: the empty-state greeting and
// suggestion chips fade+rise in with a slight stagger, once, on load.
// Nothing else on the page animates on mount.
const GREETING_STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const GREETING_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
};

/** Follow-up suggestion chip — crisp color/border change only, no motion.
 * Shared by the report and regular-answer follow-up rows. */
const FOLLOWUP_CHIP_CLASS =
  "rounded-full border border-border px-3.5 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich disabled:pointer-events-none disabled:opacity-50";

/** Sidebar list row (session/pin/report) — selected state is a thin crimson
 * left rail + tinted background, a crisp color change with no hover motion
 * or glow (restraint reads more premium than constant micro-animation). */
function sidebarItemClass(selected: boolean): string {
  return cn(
    "relative block w-full truncate rounded-md py-2 pl-3.5 pr-3 text-left text-[13px] transition-colors",
    selected
      ? "bg-[color-mix(in_srgb,var(--accent-primary)_16%,var(--bg-surface))] text-cream-rich before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[2px] before:rounded-full before:bg-[var(--accent-bright)]"
      : "text-muted-foreground hover:bg-[var(--bg-surface)]/60 hover:text-[var(--text-primary)]",
  );
}

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
// PageHeader's rendered height (title + description + padding + border).
// The history sidebar starts below this instead of at the very top, so it
// can never cover the header text regardless of open/collapsed state —
// the header doesn't need to know anything about the sidebar to stay clear.
const HEADER_HEIGHT_PX = 96;

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

// Short (<8 words), dry/witty, MAKI-Ops-specific — rotated randomly while a
// question or analysis is in flight, so waiting feels like part of the
// product's personality rather than a generic spinner.
const THINKING_LINES = [
  "Cross-examining the spend report…",
  "Making sure Peak Plumbing isn't leaking budget…",
  "Giving the CPA a lie detector test…",
  "Reading the funnel its rights…",
  "Confirming the roofers are still roofing…",
  "Asking Meta Ads to be honest…",
  "Separating real leads from wishful thinking…",
  "Running the numbers past a skeptic…",
  "Checking if Shine Detailing still shines…",
  "Weighing appointments against vibes…",
  "Double-checking who actually showed up…",
  "Making sure this isn't just optimism…",
  "Interrogating last week's ad spend…",
  "Consulting the ledger, not the mood…",
  "Giving outreach scripts a pop quiz…",
  "Not trusting a single unweighted average…",
  "Confirming Apex's numbers add up twice…",
  "Reconciling CPA with cold, hard reality…",
  "Making sure nobody's massaging the CPA…",
  "Checking if the funnel actually funnels…",
];

function pickThinkingLine(exclude?: string): string {
  if (THINKING_LINES.length <= 1) return THINKING_LINES[0];
  let next = THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)];
  while (next === exclude) {
    next = THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)];
  }
  return next;
}

/** Pulsing crimson core + orbiting particle — a small, alive mark rather
 * than a generic spinner. Pure CSS-driven motion, cheap to keep running. */
function ThinkingMark() {
  return (
    <div className="relative h-5 w-5 shrink-0">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, var(--accent-secondary) 0%, transparent 70%)",
        }}
        animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.85, 1.15, 0.85] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-[var(--accent-secondary)]"
        style={{ boxShadow: "0 0 8px 2px color-mix(in srgb, var(--accent-secondary) 70%, transparent)" }}
      />
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
      >
        <div
          className="absolute top-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--accent-cream-rich)]"
          style={{ boxShadow: "0 0 6px 1px color-mix(in srgb, var(--accent-cream-rich) 70%, transparent)" }}
        />
      </motion.div>
    </div>
  );
}

function ThinkingIndicator() {
  const [line, setLine] = useState(() => pickThinkingLine());

  useEffect(() => {
    const id = setInterval(() => {
      setLine((prev) => pickThinkingLine(prev));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground">
      <ThinkingMark />
      <AnimatePresence mode="wait">
        <motion.span
          key={line}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
        >
          {line}
        </motion.span>
      </AnimatePresence>
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

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

type SidebarTab = "chats" | "spaces" | "pinned" | "analyses";

function NewSpaceForm({
  accounts,
  onCancel,
  onCreate,
}: {
  accounts: { id: string; name: string }[];
  onCancel: () => void;
  onCreate: (input: { name: string; accountId: string | null; contextNotes: string | null }) => void;
}) {
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate({ name: name.trim(), accountId: accountId || null, contextNotes: notes.trim() || null });
      }}
      className="mx-3 mb-3 space-y-2 rounded-lg border border-border p-3"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Space name"
        className="w-full rounded-md bg-[var(--bg-surface)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-muted-foreground"
      />
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="w-full rounded-md bg-[var(--bg-surface)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
      >
        <option value="">No linked account (cross-account)</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Context notes (optional) — e.g. &quot;owner is picky about creative&quot;"
        rows={2}
        className="w-full resize-none rounded-md bg-[var(--bg-surface)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-muted-foreground transition-colors hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-full bg-[var(--accent-primary)] px-3 py-1 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-bright)] disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </form>
  );
}

function SpaceDetail({
  space,
  sessions,
  currentSessionId,
  onSelect,
  onNewChat,
  onBack,
  onSaveNotes,
}: {
  space: SpaceSummary;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onBack: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(space.contextNotes ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setNotes(space.contextNotes ?? "");
    setDirty(false);
  }, [space.id, space.contextNotes]);

  return (
    <>
      <button
        onClick={onBack}
        className="mx-3 mt-1 flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-cream-rich"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        All spaces
      </button>

      <div className="mx-3 mt-2 space-y-1.5">
        <p className="truncate text-sm font-medium text-cream-rich">{space.name}</p>
        {space.accountName && (
          <p className="text-[11px] text-muted-foreground">Linked to {space.accountName}</p>
        )}
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (dirty) {
              onSaveNotes(notes);
              setDirty(false);
            }
          }}
          placeholder="Context notes for this space…"
          rows={3}
          className="w-full resize-none rounded-md border border-border bg-[var(--bg-surface)] px-2.5 py-1.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-muted-foreground"
        />
      </div>

      <button
        onClick={onNewChat}
        className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
      >
        <Plus className="h-3.5 w-3.5" />
        New chat in this space
      </button>

      <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {sessions.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No conversations in this space yet</p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              title={s.title}
              className={sidebarItemClass(s.id === currentSessionId)}
            >
              <span className="block truncate">{s.title}</span>
              <span className="block text-[10px] text-muted-foreground/70">{formatSessionDate(s.updatedAt)}</span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function HistorySidebar({
  open,
  onToggle,
  tab,
  onTabChange,
  sessions,
  currentSessionId,
  onSelect,
  onNewChat,
  pinnedMessages,
  spaces,
  spaceAccounts,
  currentSpaceId,
  onEnterSpace,
  onExitSpace,
  onCreateSpace,
  onSaveSpaceNotes,
  reports,
  onSelectReport,
}: {
  open: boolean;
  onToggle: () => void;
  tab: SidebarTab;
  onTabChange: (t: SidebarTab) => void;
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  pinnedMessages: PinnedMessage[];
  spaces: SpaceSummary[];
  spaceAccounts: { id: string; name: string }[];
  currentSpaceId: string | null;
  onEnterSpace: (id: string) => void;
  onExitSpace: () => void;
  onCreateSpace: (input: { name: string; accountId: string | null; contextNotes: string | null }) => void;
  onSaveSpaceNotes: (notes: string) => void;
  reports: ReportItem[];
  onSelectReport: (report: ReportItem) => void;
}) {
  const [showNewSpaceForm, setShowNewSpaceForm] = useState(false);
  const activeSpace = spaces.find((s) => s.id === currentSpaceId) ?? null;

  const TABS: { key: SidebarTab; label: string }[] = [
    { key: "chats", label: "Chats" },
    { key: "spaces", label: "Spaces" },
    { key: "pinned", label: "Pinned" },
    { key: "analyses", label: "Analyses" },
  ];

  return (
    <>
      <aside
        className={cn(
          "fixed bottom-0 z-30 hidden flex-col border-r border-border bg-[var(--sidebar)] md:flex",
          open ? "w-64" : "w-0 overflow-hidden border-r-0",
        )}
        // Starts below the page header (not inset-y-0 from the very top) so
        // it can never render over the "Insights" title/description.
        style={{ left: MAIN_NAV_PX, top: HEADER_HEIGHT_PX }}
      >
        <div className="flex items-center justify-end px-3 pt-3">
          <button
            onClick={onToggle}
            className="text-muted-foreground transition-colors hover:text-cream-rich"
            aria-label="Collapse history"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 px-3 pt-1 pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium tracking-[0.06em] uppercase transition-colors",
                tab === t.key
                  ? "bg-[var(--bg-surface)] text-cream-rich"
                  : "text-muted-foreground hover:text-[var(--text-primary)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "chats" && (
          <>
            <button
              onClick={onNewChat}
              className="mx-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </button>
            <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
              {sessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No conversations yet</p>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    title={s.title}
                    className={sidebarItemClass(s.id === currentSessionId)}
                  >
                    <span className="block truncate">{s.title}</span>
                    <span className="block text-[10px] text-muted-foreground/70">
                      {formatSessionDate(s.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {tab === "spaces" &&
          (activeSpace ? (
            <SpaceDetail
              space={activeSpace}
              sessions={sessions}
              currentSessionId={currentSessionId}
              onSelect={onSelect}
              onNewChat={onNewChat}
              onBack={onExitSpace}
              onSaveNotes={onSaveSpaceNotes}
            />
          ) : (
            <>
              {showNewSpaceForm ? (
                <NewSpaceForm
                  accounts={spaceAccounts}
                  onCancel={() => setShowNewSpaceForm(false)}
                  onCreate={(input) => {
                    onCreateSpace(input);
                    setShowNewSpaceForm(false);
                  }}
                />
              ) : (
                <button
                  onClick={() => setShowNewSpaceForm(true)}
                  className="mx-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Space
                </button>
              )}
              <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
                {spaces.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No spaces yet — create one to keep an account&apos;s context ready without re-typing it.
                  </p>
                ) : (
                  spaces.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onEnterSpace(s.id)}
                      title={s.name}
                      className={sidebarItemClass(false)}
                    >
                      <span className="block truncate">{s.name}</span>
                      {s.accountName && (
                        <span className="block text-[10px] text-muted-foreground/70">{s.accountName}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          ))}

        {tab === "pinned" && (
          <div className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
            {pinnedMessages.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No pinned answers yet</p>
            ) : (
              pinnedMessages.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelect(p.sessionId)}
                  title={p.content}
                  className={sidebarItemClass(p.sessionId === currentSessionId)}
                >
                  {p.content}
                </button>
              ))
            )}
          </div>
        )}

        {tab === "analyses" && (
          <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
            {reports.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No analyses yet — run a full analysis from the input bar.
              </p>
            ) : (
              reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectReport(r)}
                  title={r.content}
                  className={sidebarItemClass(false)}
                >
                  <span className="block text-[11px] font-medium text-cream-rich">
                    {formatReportDate(r.createdAt)}
                  </span>
                  <span className="line-clamp-2 text-[12px] leading-snug">{r.content}</span>
                </button>
              ))
            )}
          </div>
        )}
      </aside>

      {!open && (
        <button
          onClick={onToggle}
          aria-label="Open history"
          // Sits below the page header row (title + description), never
          // beside it — top-5 used to land right on top of "Insights".
          className="fixed top-24 z-30 hidden rounded-full border border-border bg-[var(--bg-surface)] p-2 text-muted-foreground transition-colors hover:text-cream-rich md:flex"
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
  initialPriorities,
}: {
  configured: boolean;
  initialUsage: { queryCount: number; cap: number; estimatedCostUsd: number };
  initialDigest?: DigestItem[];
  initialPriorities?: PriorityItem[];
}) {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(initialUsage);
  const [digest, setDigest] = useState<DigestItem[]>(initialDigest ?? []);
  const [priorities] = useState<PriorityItem[]>(initialPriorities ?? []);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chats");
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [spaceAccounts, setSpaceAccounts] = useState<{ id: string; name: string }[]>([]);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const [inputBarHeight, setInputBarHeight] = useState(160);

  // The input bar's real height varies (space indicator, "Run analysis" row
  // both toggle on/off), so a fixed pb-* class on the scroll container was
  // occasionally too short and let content get covered. Measure it instead.
  useEffect(() => {
    const el = inputBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height) setInputBarHeight(height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const refreshSessions = useCallback((spaceId: string | null) => {
    listInsightsSessions(spaceId).then(setSessions);
  }, []);

  const refreshPins = useCallback(() => {
    listPinnedMessageIds().then((ids) => setPinnedIds(new Set(ids)));
    listPinnedMessages().then(setPinnedMessages);
  }, []);

  const refreshSpaces = useCallback(() => {
    listInsightsSpaces().then(setSpaces);
  }, []);

  const refreshReports = useCallback(() => {
    listInsightsReports().then(setReports);
  }, []);

  useEffect(() => {
    refreshSessions(null);
    refreshPins();
    refreshSpaces();
    refreshReports();
    listAccountsForSpacePicker().then(setSpaceAccounts);
  }, [refreshSessions, refreshPins, refreshSpaces, refreshReports]);

  // Sidebar session list follows whichever scope is currently being browsed:
  // general (Chats tab) or a specific Space's history (Spaces tab, entered).
  useEffect(() => {
    refreshSessions(sidebarTab === "spaces" ? currentSpaceId : null);
  }, [sidebarTab, currentSpaceId, refreshSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setInput("");
    const res = await askInsights(q, currentSessionId, currentSpaceId);
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
    refreshSessions(sidebarTab === "spaces" ? currentSpaceId : null);
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
    setCurrentSpaceId(session.spaceId);
    setExchanges(messagesToExchanges(session.messages));
  }

  function startNewChat() {
    if (loading) return;
    setCurrentSessionId(null);
    setExchanges([]);
    // Chats-tab "New chat" is always general; a Space's own "New chat in
    // this space" button reuses this same handler but currentSpaceId is
    // already set from having entered that space, so it's preserved here.
    if (sidebarTab === "chats") setCurrentSpaceId(null);
  }

  function handleTabChange(t: SidebarTab) {
    setSidebarTab(t);
    if (t === "chats") setCurrentSpaceId(null);
  }

  function enterSpace(id: string) {
    setCurrentSpaceId(id);
  }

  function exitSpace() {
    setCurrentSpaceId(null);
  }

  async function handleCreateSpace(input: { name: string; accountId: string | null; contextNotes: string | null }) {
    const id = await createInsightsSpace(input);
    refreshSpaces();
    if (id) setCurrentSpaceId(id);
  }

  function handleSaveSpaceNotes(notes: string) {
    if (!currentSpaceId) return;
    setSpaces((prev) => prev.map((s) => (s.id === currentSpaceId ? { ...s, contextNotes: notes } : s)));
    updateInsightsSpaceNotes(currentSpaceId, notes).catch(() => {
      toast.error("Couldn't save space notes.");
    });
  }

  function dismissFlag(id: string) {
    setDigest((prev) => prev.filter((d) => d.id !== id));
    dismissDigestFinding(id).catch(() => {
      toast.error("Couldn't dismiss that flag.");
    });
  }

  /** Appends the fresh report to whatever's currently on screen (rather than
   * replacing it) — it's saved separately to insights_reports either way, so
   * running an analysis mid-chat doesn't lose the conversation you were in. */
  async function handleRunAnalysis() {
    if (analyzing || loading) return;
    setAnalyzing(true);
    const res = await runFullAnalysis(currentSpaceId);
    setAnalyzing(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    if ("limited" in res) {
      toast.error(`Monthly limit reached (${res.used}/${res.cap}).`);
      return;
    }
    setExchanges((prev) => [
      ...prev,
      {
        kind: "report",
        createdAt: res.report.createdAt,
        result: {
          answer: res.report.content,
          caveat: res.report.caveat,
          follow_ups: res.report.followUps,
          data_available: true,
          mentioned_entities: res.report.mentionedEntities,
        },
      },
    ]);
    refreshReports();
  }

  function handleSelectReport(report: ReportItem) {
    setCurrentSessionId(null);
    setExchanges([
      {
        kind: "report",
        createdAt: report.createdAt,
        result: {
          answer: report.content,
          caveat: report.caveat,
          follow_ups: report.followUps,
          data_available: true,
          mentioned_entities: report.mentionedEntities,
        },
      },
    ]);
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
  const activeSpace = spaces.find((s) => s.id === currentSpaceId) ?? null;

  return (
    <div className="relative">
      <HistorySidebar
        open={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
        tab={sidebarTab}
        onTabChange={handleTabChange}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelect={selectSession}
        onNewChat={startNewChat}
        pinnedMessages={pinnedMessages}
        spaces={spaces}
        spaceAccounts={spaceAccounts}
        currentSpaceId={currentSpaceId}
        onEnterSpace={enterSpace}
        onExitSpace={exitSpace}
        onCreateSpace={handleCreateSpace}
        onSaveSpaceNotes={handleSaveSpaceNotes}
        reports={reports}
        onSelectReport={handleSelectReport}
      />

      <div className={cn("transition-[padding] duration-200", contentOffsetClass)}>
        {/* Usage badge — small, top-right, out of the reading flow */}
        <div className="flex justify-end px-6 pt-4 sm:px-10">
          <UsageRing used={usage.queryCount} cap={usage.cap} costUsd={usage.estimatedCostUsd} />
        </div>

        {/* Conversation — scrolls in normal page flow; bottom padding clears the fixed input bar */}
        <div
          className="mx-auto w-full max-w-[760px] px-6 pt-6 sm:px-10"
          style={{ paddingBottom: inputBarHeight + 32 }}
        >
          {digest.length > 0 && (
            <div className="mb-8 space-y-2 border-b border-border/60 pb-6">
              <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Today&apos;s flags
              </p>
              {digest.map((d) => {
                // Ghost leads (24h+ uncontacted) are critical, not just a
                // warning — reads in the brighter alert red, everything
                // else stays the standard amber "flag" tone.
                const critical = d.findingType === "ghost_leads";
                return (
                  <div key={d.id} className="flex items-start justify-between gap-3">
                    <p
                      className={cn(
                        "flex items-start gap-1.5 text-[14px] leading-relaxed",
                        critical ? "font-medium text-[var(--accent-bright)]" : "text-[var(--warning)]",
                      )}
                    >
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
                );
              })}
            </div>
          )}

          {exchanges.length === 0 && !loading && !analyzing ? (
            <motion.div className="pt-10" variants={GREETING_STAGGER} initial="hidden" animate="show">
              {priorities.length > 0 && (
                <motion.div variants={GREETING_ITEM} className="mb-7">
                  <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    <Target className="h-3 w-3 text-copper" />
                    Where to focus
                  </p>
                  <div className="space-y-2">
                    {priorities.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => ask("What should I focus on?")}
                        className="block text-left text-[15px] leading-relaxed text-[var(--text-primary)] transition-colors hover:text-cream-rich"
                      >
                        {p.message}
                        {p.estimatedImpact !== null && (
                          <span className="ml-1.5 font-semibold text-copper">
                            ~{money(p.estimatedImpact)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              <motion.p variants={GREETING_ITEM} className="mb-4 text-[15px] text-muted-foreground">
                Ask anything about your live data. Try:
              </motion.p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <motion.button
                    key={s}
                    variants={GREETING_ITEM}
                    onClick={() => ask(s)}
                    className="rounded-full border border-border px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
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
                  {/* User message — plain, right-aligned, secondary. Reports have no question. */}
                  {ex.kind !== "report" && (
                    <p className="ml-auto w-fit max-w-[80%] rounded-2xl bg-[var(--bg-surface)]/50 px-4 py-2 text-right text-[14px] text-[var(--text-muted)]">
                      {ex.q}
                    </p>
                  )}

                  {ex.kind === "limited" ? (
                    <p className="flex items-start gap-1.5 text-[15px] text-[var(--warning)]">
                      <span className="mt-0.5">
                        <CircleAlert className="h-4 w-4" />
                      </span>
                      You&apos;ve used {ex.used} of {ex.cap} queries this month — the
                      limit resets at the start of next calendar month.
                    </p>
                  ) : ex.kind === "report" ? (
                    <>
                      {/* Signature moment — a torn work-order-stub edge, used
                          nowhere else on the page. See .job-ticket-tear. */}
                      <div className="pt-2">
                        <div className="job-ticket-tear mb-4" />
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
                          <FileText className="h-3 w-3 text-copper" />
                          <span className="text-cream-rich">Full Analysis</span> — {formatReportDate(ex.createdAt)}
                        </p>
                        <InsightAnswer result={ex.result} />
                      </div>
                      {!!ex.result.follow_ups?.length && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {ex.result.follow_ups.map((f) => (
                            <button
                              key={f}
                              onClick={() => ask(f)}
                              disabled={loading}
                              className={FOLLOWUP_CHIP_CLASS}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
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
                              className={FOLLOWUP_CHIP_CLASS}
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
              {(loading || analyzing) && <ThinkingIndicator />}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input — fixed to the bottom of the viewport, offset past the sidebar(s) on desktop */}
        <div className={cn("fixed inset-x-0 bottom-0 z-20 transition-[left] duration-200", inputLeftClass)}>
          <div
            ref={inputBarRef}
            className="bg-gradient-to-t from-background via-background/95 to-transparent px-6 pt-8 pb-6 sm:px-10"
          >
            {activeSpace && (
              <div className="mx-auto mb-2 flex w-full max-w-[760px] items-center gap-1.5 text-[12px] text-muted-foreground">
                <Compass className="h-3 w-3" />
                <span>
                  Asking in <span className="text-cream-rich">{activeSpace.name}</span>
                </span>
                <button
                  onClick={exitSpace}
                  aria-label="Exit space"
                  className="ml-0.5 transition-colors hover:text-cream-rich"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="mx-auto mb-2 flex w-full max-w-[760px] justify-end">
              <button
                onClick={handleRunAnalysis}
                disabled={analyzing || loading}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-cream-rich disabled:opacity-50"
              >
                <FileText className="h-3 w-3" />
                {analyzing ? "Analyzing…" : "Run a full analysis"}
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="mx-auto flex w-full max-w-[760px] items-center gap-2 rounded-full border border-border bg-[var(--bg-surface)] px-4 py-2 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.6)] transition-shadow duration-200 focus-within:border-[color-mix(in_srgb,var(--accent-bright)_70%,transparent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-bright)_22%,transparent),0_12px_32px_-16px_rgba(0,0,0,0.6)]"
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
                className="rounded-full"
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
