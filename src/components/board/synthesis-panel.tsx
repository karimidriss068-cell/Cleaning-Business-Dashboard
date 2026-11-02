"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkCheck, ClipboardCheck } from "lucide-react";
import { logBoardDecision } from "@/app/actions/board";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { useFinanceAction } from "@/components/invoices/use-finance-action";
import { rawSynthesisSchema, synthesisSchema, type BoardSessionRow } from "@/lib/schemas/board";
import { AI_LABEL } from "@/lib/board/advisors";

/** The chair's synthesis: verdict, where the advisors agreed and split, three actions, and the Log decision button. */
export function SynthesisPanel({ session }: { session: BoardSessionRow }) {
  const { run, pending } = useFinanceAction();
  const [chosen, setChosen] = useState(0);
  const full = synthesisSchema.safeParse(session.synthesis);
  const raw = rawSynthesisSchema.safeParse(session.synthesis);
  const logged = session.logged_decision_id !== null;

  if (!full.success) {
    return (
      <GlassPanel as="section" aria-labelledby="board-synth" level="popover" className="kc-enter space-y-2 p-5" data-testid="board-synthesis">
        <h2 id="board-synth" className="font-heading text-lg font-medium text-ink">Synthesis</h2>
        {raw.success ? (
          <>
            <p className="text-[13px] text-ink-muted">The synthesis came back in a shape the app could not read, so it is shown as text. It cannot be logged.</p>
            <p className="text-sm whitespace-pre-wrap text-ink">{raw.data.raw}</p>
          </>
        ) : (
          <p className="text-sm text-ink-muted">The synthesis did not run because the session stopped early. The advisors that finished are above. Ask again to get a synthesis.</p>
        )}
      </GlassPanel>
    );
  }
  const s = full.data;
  return (
    <GlassPanel as="section" aria-labelledby="board-synth" level="popover" className="kc-enter space-y-5 p-5" data-testid="board-synthesis">
      <div className="space-y-1">
        <h2 id="board-synth" className="flex flex-wrap items-center gap-2 font-heading text-lg font-medium text-ink">Synthesis <StatusPill tone="secondary">AI chair</StatusPill></h2>
        <p className="text-[12px] text-ink-muted">{AI_LABEL}</p>
      </div>
      <p className="text-base font-medium text-ink" data-testid="board-verdict">{s.verdict}</p>
      <p className="text-sm whitespace-pre-wrap text-ink-muted">{s.summary}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-ink">Where they agree</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-muted">{s.agreements.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
        <div>
          <h3 className="text-sm font-medium text-ink">Where they split</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-muted">{s.disagreements.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">Next 7 days: 3 actions, in priority order</h3>
        <fieldset className="mt-2 space-y-2" disabled={logged || pending}>
          <legend className="sr-only">Choose the action to log</legend>
          {s.actions.map((a, i) => (
            <GlassPanel key={i} level="flat" as="label" className="flex cursor-pointer items-start gap-3 p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" data-testid="board-action">
              <input type="radio" name="board-action" checked={chosen === i} onChange={() => setChosen(i)} className="mt-1 size-4 accent-[var(--kc-brand)]" aria-label={`Action ${i + 1}: ${a.title}`} />
              <span className="min-w-0 text-sm">
                <span className="font-medium text-ink">{i + 1}. {a.title}</span>
                <span className="block text-[13px] text-ink-muted">{a.why}</span>
              </span>
            </GlassPanel>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
        {logged ? (
          <>
            <StatusPill tone="success">Logged</StatusPill>
            <Link href="/growth" className="inline-flex items-center gap-1.5 text-sm text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"><BookmarkCheck className="size-4" aria-hidden /> See it in the Go/No-go decision log</Link>
          </>
        ) : (
          <>
            <Button type="button" disabled={pending} className="h-11 md:h-9" data-testid="board-log"
              onClick={() => run(() => logBoardDecision({ sessionId: session.id, actionIndex: chosen }), "Added to the decision log")}>
              <ClipboardCheck aria-hidden /> Log decision
            </Button>
            <p className="text-[12px] text-ink-muted">Saves the verdict and the action you chose to the Go/No-go decision log.</p>
          </>
        )}
      </div>
    </GlassPanel>
  );
}
