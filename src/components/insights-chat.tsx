"use client";

import { useState, Fragment } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { askInsights, type InsightsAnswer } from "@/app/(app)/insights/actions";
import { Button } from "@/components/ui/button";
import { EntityChip } from "@/components/entity-chip";
import { StatList } from "@/components/stat-list";
import { UsageRing } from "@/components/usage-ring";
import { Sparkles, ArrowUp, CircleAlert, Gauge } from "lucide-react";

const SUGGESTIONS = [
  "Which account is at risk?",
  "What's my top-spending account?",
  "Which creative should I scale?",
  "How does my outreach volume compare to what's converting?",
];

type Exchange =
  | { q: string; kind: "answer"; result: InsightsAnswer }
  | { q: string; kind: "limited"; used: number; cap: number };

const ENTER = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

const ENTITY_ROUTE: Record<InsightsAnswer["mentioned_entities"][number]["type"], (id: string) => string> = {
  account: (id) => `/accounts/${id}`,
  campaign: (id) => `/campaigns/${id}`,
  script: (id) => `/outreach/${id}`,
  creative: () => `/creatives`,
};

/** Splits text on any mentioned entity's exact name and turns those
 * occurrences into pill-shaped entity chips (not underlined links). Falls
 * back to plain text for anything that doesn't match exactly. */
function chipifyEntities(text: string, entities: InsightsAnswer["mentioned_entities"]) {
  const uniqueByName = entities.filter(
    (e, i) => e.name && entities.findIndex((o) => o.name === e.name) === i,
  );
  if (uniqueByName.length === 0) return text;

  const sorted = [...uniqueByName].sort((a, b) => b.name.length - a.name.length);
  const pattern = sorted.map((e) => e.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${pattern})`, "g");
  const parts = text.split(regex);

  return parts.map((part, i) => {
    const entity = sorted.find((e) => e.name === part);
    if (!entity) return <Fragment key={i}>{part}</Fragment>;
    return (
      <EntityChip key={i} href={ENTITY_ROUTE[entity.type](entity.id)}>
        {part}
      </EntityChip>
    );
  });
}

/** Structured stat-card rendering of one AI answer — Fraunces headline,
 * compact stat grid, footnote caveat. Matches the panel-glass/oxblood
 * language used across /accounts and /dashboard rather than a chat bubble. */
function InsightAnswerCard({ result }: { result: InsightsAnswer }) {
  const headline = result.headline ?? result.answer;
  const items = (result.breakdown ?? []).map((item) => ({
    label: item.label,
    value: chipifyEntities(item.value, result.mentioned_entities),
  }));

  return (
    <div className="panel-glass px-7 py-7 sm:px-8 sm:py-8">
      {!result.data_available && (
        <div className="relative z-10 mb-3 flex items-center gap-1.5 text-xs font-medium text-[var(--warning)]">
          <CircleAlert className="h-3.5 w-3.5" />
          Not answerable from current data
        </div>
      )}

      <p className="relative z-10 font-heading text-[19px] leading-[1.3] font-medium text-cream-rich sm:text-[22px]">
        {chipifyEntities(headline, result.mentioned_entities)}
      </p>

      {items.length > 0 && (
        <StatList items={items} className="relative z-10 mt-6 border-t border-border/60 pt-6" />
      )}

      {result.caveat && (
        <p className="relative z-10 mt-5 text-xs text-muted-foreground italic">{result.caveat}</p>
      )}
    </div>
  );
}

function AnswerCardSkeleton() {
  return (
    <div className="panel-glass space-y-6 px-7 py-7 sm:px-8 sm:py-8">
      <div className="space-y-2.5">
        <div className="skeleton h-4 w-[92%]" />
        <div className="skeleton h-4 w-[65%]" />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border/60 pt-6 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-2.5 w-16" />
            <div className="skeleton h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InsightsChat({
  configured,
  initialUsage,
}: {
  configured: boolean;
  initialUsage: { queryCount: number; cap: number; estimatedCostUsd: number };
}) {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState(initialUsage);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setInput("");
    const res = await askInsights(q);
    setLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    if ("limited" in res) {
      setExchanges((prev) => [...prev, { q, kind: "limited", used: res.used, cap: res.cap }]);
      setUsage((prev) => ({ ...prev, queryCount: res.used }));
      return;
    }
    setExchanges((prev) => [...prev, { q, kind: "answer", result: res.result }]);
    setUsage((prev) => ({ ...prev, queryCount: prev.queryCount + 1 }));
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 font-medium">AI insights aren&apos;t configured yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Add an <code className="text-primary">ANTHROPIC_API_KEY</code> to your
          environment (get one at console.anthropic.com), then restart. You&apos;ll
          be able to ask plain-English questions about your live data here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      {/* Usage badge — top-right */}
      <div className="flex justify-end">
        <UsageRing used={usage.queryCount} cap={usage.cap} costUsd={usage.estimatedCostUsd} />
      </div>

      {/* Conversation */}
      {exchanges.length === 0 && !loading ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Ask anything about your live data. Try:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-[var(--bg-surface)] px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_60%,transparent)] hover:text-cream-rich"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {exchanges.map((ex, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ENTER}
              className="space-y-3"
            >
              {/* User message — small, right-aligned, visually secondary */}
              <p className="ml-auto w-fit max-w-[75%] rounded-full bg-[var(--bg-surface)]/60 px-3.5 py-1.5 text-[13px] text-[var(--text-muted)]">
                {ex.q}
              </p>
              {ex.kind === "limited" ? (
                <div className="panel-glass border-[var(--warning)]/30 px-7 py-6">
                  <div className="relative z-10 flex items-center gap-1.5 text-sm font-medium text-[var(--warning)]">
                    <Gauge className="h-4 w-4" />
                    Monthly limit reached
                  </div>
                  <p className="relative z-10 mt-1.5 text-sm text-muted-foreground">
                    You&apos;ve used {ex.used} of {ex.cap} queries this month. The
                    limit resets at the start of next calendar month.
                  </p>
                </div>
              ) : (
                <InsightAnswerCard result={ex.result} />
              )}
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ENTER}
            >
              <AnswerCardSkeleton />
            </motion.div>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-6 flex items-center gap-2 rounded-full border border-border bg-[var(--bg-surface)] py-1.5 pr-1.5 pl-4 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.6)]"
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
  );
}
