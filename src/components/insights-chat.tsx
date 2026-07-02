"use client";

import { useState } from "react";
import { toast } from "sonner";
import { askInsights } from "@/app/(app)/insights/actions";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowUp } from "lucide-react";

const SUGGESTIONS = [
  "What's my best-performing outreach script?",
  "Which client has the worst CPA trend?",
  "How many appointments did I book this week vs last week?",
  "Is any client campaign at risk right now?",
  "Compare this week's spend to last week across all accounts.",
];

type Exchange = { q: string; a: string };

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
        <div className="rounded-lg border border-border bg-card/40 p-6">
          <p className="mb-3 text-sm text-muted-foreground">
            Ask anything about your live data. Try:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-[var(--accent-primary)] hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {exchanges.map((ex, i) => (
            <div key={i} className="space-y-2">
              <p className="font-heading text-lg tracking-tight">{ex.q}</p>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {ex.a}
              </p>
            </div>
          ))}
          {loading && (
            <p className="animate-pulse text-sm text-muted-foreground">
              Analyzing your data…
            </p>
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
        <Button type="submit" size="icon-sm" disabled={loading || !input.trim()}>
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
