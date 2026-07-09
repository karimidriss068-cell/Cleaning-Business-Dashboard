"use client";

import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { askInsights } from "@/app/(app)/insights/actions";
import { Button } from "@/components/ui/button";
import { cardHover } from "@/components/dashboard/motion-variants";
import { Sparkles, ArrowUp } from "lucide-react";

const SUGGESTIONS = [
  "What's my best-performing outreach script?",
  "Which client has the worst CPA trend?",
  "How many appointments did I book this week vs last week?",
  "Is any client campaign at risk right now?",
  "Compare this week's spend to last week across all accounts.",
];

type Exchange = { q: string; a: string };

const ENTER = { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

export function InsightsChat({ configured }: { configured: boolean }) {
  const [input, setInput] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);

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
    setExchanges((prev) => [...prev, { q, a: res.answer }]);
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
              {/* Assistant answer — glass panel, generous body typography */}
              <div className="panel-glass px-5 py-4">
                <p className="relative z-10 whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--text-primary)]">
                  {ex.a}
                </p>
              </div>
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
