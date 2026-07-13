"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { askInsights, type InsightsAnswer } from "@/app/(app)/insights/actions";
import { Button } from "@/components/ui/button";
import { cardHover } from "@/components/dashboard/motion-variants";
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

/** Splits answer text on any mentioned entity's exact name and turns those
 * occurrences into links to the relevant page. Falls back to plain text for
 * anything that doesn't match (e.g. slightly reworded mentions). */
function linkifyAnswer(text: string, entities: InsightsAnswer["mentioned_entities"]) {
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
      <Link
        key={i}
        href={ENTITY_ROUTE[entity.type](entity.id)}
        className="font-medium text-[var(--accent-bright)] underline underline-offset-2 hover:text-cream-rich"
      >
        {part}
      </Link>
    );
  });
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
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Usage indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Gauge className="h-3.5 w-3.5" />
        <span className="font-data tabular-nums">
          {usage.queryCount} / {usage.cap}
        </span>
        <span>queries this month</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="font-data tabular-nums">
          ~${usage.estimatedCostUsd.toFixed(2)} estimated
        </span>
      </div>

      {/* Conversation */}
      {exchanges.length === 0 && !loading ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Ask anything about your live data. Try:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <motion.button
                key={s}
                onClick={() => ask(s)}
                whileHover={cardHover}
                className="panel-glass px-4 py-3.5 text-left text-sm leading-relaxed text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="relative z-10">{s}</span>
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {exchanges.map((ex, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ENTER}
              className="space-y-3"
            >
              {/* User message — plain, so the assistant's answer reads as the content */}
              <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-[var(--bg-surface-raised)] px-3.5 py-2 text-sm text-[var(--text-primary)]">
                {ex.q}
              </p>
              {ex.kind === "limited" ? (
                <div className="panel-glass border-[var(--warning)]/30 px-5 py-4">
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
                <div className="panel-glass px-5 py-4">
                  {!ex.result.data_available && (
                    <div className="relative z-10 mb-2.5 flex items-center gap-1.5 text-xs font-medium text-[var(--warning)]">
                      <CircleAlert className="h-3.5 w-3.5" />
                      Not answerable from current data
                    </div>
                  )}
                  <p className="relative z-10 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-primary)]">
                    {linkifyAnswer(ex.result.answer, ex.result.mentioned_entities)}
                  </p>
                </div>
              )}
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ENTER}
              className="panel-glass space-y-2.5 px-5 py-4"
            >
              <div className="skeleton h-3.5 w-[85%]" />
              <div className="skeleton h-3.5 w-[95%]" />
              <div className="skeleton h-3.5 w-[60%]" />
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
        className="sticky bottom-6 flex items-center gap-2 rounded-lg border border-border bg-card p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your data…"
          className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          disabled={loading}
        />
        <Button type="submit" size="icon-sm" loading={loading} disabled={!input.trim()}>
          {!loading && <ArrowUp className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
