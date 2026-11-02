"use client";

import Link from "next/link";
import { AI_LABEL, type AdvisorKey } from "@/lib/board/advisors";
import type { Beat } from "@/lib/board/scene/script";
import { cn } from "@/lib/utils";
import { BoardPanel, Controls, Conversation, usePlayer } from "@/components/board/scene/shared";
import { MiniA, StageA } from "@/components/board/scene/style-a";
import { MiniB, StageB } from "@/components/board/scene/style-b";
import { MiniC, StageC } from "@/components/board/scene/style-c";
import { STYLES, type SceneStyle } from "@/components/board/scene/styles";

/** Style switcher: plain links, so the choice is in the address and survives a reload. */
export function StyleSwitcher({ current, moment }: { current: SceneStyle; moment?: string }) {
  return (
    <nav aria-label="Scene style" className="flex flex-wrap gap-1.5" data-testid="scene-styles">
      {STYLES.map((s) => (
        <Link key={s.key} href={`?style=${s.key}${moment ? `&moment=${moment}` : ""}`} aria-current={current === s.key ? "page" : undefined} data-testid={`style-${s.key}`}
          className={cn("inline-flex h-9 items-center rounded-full px-3.5 text-sm outline-none ring-1 ring-inset ring-hairline transition-colors focus-visible:ring-2 focus-visible:ring-ring", current === s.key ? "bg-brand/15 font-medium text-ink ring-brand" : "text-ink-muted hover:text-ink")}>
          {s.name}
        </Link>
      ))}
    </nav>
  );
}

export function Boardroom({ script, advisors, style, start = { beat: 0, progress: 0, paused: false } }: { script: readonly Beat[]; advisors: readonly AdvisorKey[]; style: SceneStyle; start?: { beat: number; progress: number; paused: boolean } }) {
  const p = usePlayer(script, start);
  const { view, state } = p;
  const Stage = style === "a" ? StageA : style === "b" ? StageB : StageC;
  const Mini = style === "a" ? MiniA : style === "b" ? MiniB : MiniC;
  return (
    <div className="space-y-5" data-testid="boardroom" data-style={style} data-beat={state.beat} data-stage={view.stage} data-playing={state.playing} data-done={state.done}>
      <p className="text-[12px] text-ink-muted" data-testid="scene-label">{AI_LABEL}</p>
      <Controls p={p} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0">
          <Stage view={view} advisors={advisors} script={script} />
          <Conversation view={view} playing={state.playing} Mini={Mini} />
        </div>
        <div className="order-first lg:order-none"><BoardPanel view={view} script={script} /></div>
      </div>
    </div>
  );
}
