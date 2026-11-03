"use client";

import { useState } from "react";
import { ADVISORS, type AdvisorKey } from "@/lib/board/advisors";
import { PORTRAIT, type PortraitWho } from "@/lib/board/scene/portraits";
import { BRAIN_SLUG_FOR_PORTRAIT } from "@/lib/board/brains";
import { HOT_SHEETS } from "@/lib/board/brains/hot.generated";
import { Bust } from "@/components/board/scene/bust";
import { GlassPanel } from "@/components/system/glass-panel";

type Seat = { who: PortraitWho; name: string; question: string };
const SEATS: Seat[] = [
  { who: "chair", name: "Chair", question: "Weighs every lens and gives the verdict plus three actions for the next 7 days." },
  ...ADVISORS.map((a) => ({ who: a.key as AdvisorKey, name: a.name, question: a.question })),
];
const pretty = (slug: string) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Every Roast Room seat: talking portrait, the lens it owns, and the brain hot sheet it reasons from. */
export function AdvisorBench() {
  const [open, setOpen] = useState<PortraitWho | null>(null);
  const [hover, setHover] = useState<PortraitWho | null>(null);
  const sheet = open ? HOT_SHEETS[BRAIN_SLUG_FOR_PORTRAIT[PORTRAIT[open]]] : null;
  return (
    <GlassPanel as="section" aria-labelledby="bench-title" className="kc-enter space-y-4 p-5" data-testid="advisor-bench">
      <div>
        <h2 id="bench-title" className="font-heading text-lg font-medium text-ink">The board</h2>
        <p className="text-[13px] text-ink-muted">{SEATS.length} seats, each with its own portrait and brain. Tap a seat to read the brain it reasons from.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {SEATS.map((s) => {
          const slug = BRAIN_SLUG_FOR_PORTRAIT[PORTRAIT[s.who]];
          const active = open === s.who;
          return (
            <button key={s.who} type="button" onClick={() => setOpen(active ? null : s.who)} onMouseEnter={() => setHover(s.who)} onMouseLeave={() => setHover(null)}
              aria-pressed={active} data-testid={`bench-${s.who}`}
              className={`group flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${active ? "border-ink/40 bg-ink/5" : "border-hairline hover:border-ink/25"}`}>
              <Bust who={s.who} state={hover === s.who || active ? "speaking" : "idle"} className="w-full max-w-[120px]" alt={`${s.name} portrait`} />
              <span className="text-[13px] font-medium leading-tight text-ink">{s.name}</span>
              <span className="text-[11px] uppercase tracking-wide text-ink-muted">{slug ? pretty(slug) : ""} brain</span>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="rounded-xl border border-hairline p-4" data-testid="bench-brain">
          <p className="text-sm font-medium text-ink">{SEATS.find((s) => s.who === open)?.name} · {pretty(BRAIN_SLUG_FOR_PORTRAIT[PORTRAIT[open]])} brain</p>
          <p className="mb-2 text-[12px] text-ink-muted">{SEATS.find((s) => s.who === open)?.question}</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[12px] leading-relaxed text-ink-muted">{sheet ?? "Brain sheet missing."}</pre>
        </div>
      )}
    </GlassPanel>
  );
}
