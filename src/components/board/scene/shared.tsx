"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FastForward, Pause, Play, RotateCcw } from "lucide-react";
import { advisorByKey } from "@/lib/board/advisors";
import { deriveView, initialPlayer, pause, play, replay, seek, setSpeed, skipToVerdict, SPEEDS, tick, type FeedItem, type PlayerState, type SceneView } from "@/lib/board/scene/player";
import { REACTION_LABEL, VOTE_LABEL, type Beat, type Reaction, type Vote } from "@/lib/board/scene/script";
import { useReducedMotion } from "@/lib/motion/hooks";
import type { Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import type { AvatarWho, NodeState } from "@/components/board/scene/glyphs";

export const nameOf = (who: AvatarWho) => (who === "chair" ? "Chair" : advisorByKey(who).name);
export const voteTone: Record<Vote, Tone> = { for: "success", conditional: "info", against: "danger" };
export const reactionTone: Record<Reaction, Tone> = { agrees: "success", pushes_back: "danger", adds_condition: "info" };
export { REACTION_LABEL, VOTE_LABEL };

/** Who the scene should look at right now: the speaker or thinker, nobody while the votes come in. */
export const focusOf = (view: SceneView): AvatarWho | null => (view.stage === "voting" ? null : view.thinking ?? view.speaker);
export const stateOf = (view: SceneView, who: AvatarWho): NodeState => (view.thinking === who ? "thinking" : view.speaker === who ? "speaking" : "idle");

/** Drives playback from the clock. The logic is pure and tested in lib/board/scene/player.ts. */
export function usePlayer(script: readonly Beat[], start: { beat: number; progress: number; paused: boolean }) {
  const reduced = useReducedMotion();
  const [state, setState] = useState<PlayerState>(() => {
    const base = initialPlayer(!start.paused);
    return start.beat > 0 || start.progress > 0 ? seek(base, script, start.beat, start.progress) : base;
  });
  const playing = state.playing;
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function frame(now) {
      const dt = Math.min(100, now - last);
      last = now;
      setState((s) => tick(s, script, dt, reduced));
      raf = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, script, reduced]);
  const view = useMemo(() => deriveView(script, state, reduced), [script, state, reduced]);
  return {
    state, view,
    togglePlay: () => setState((s) => (s.done ? replay(s) : s.playing ? pause(s) : play(s))),
    speed: (v: number) => setState((s) => setSpeed(s, v)),
    skip: () => setState((s) => skipToVerdict(s, script)),
    replay: () => setState((s) => replay(s)),
  };
}
export type Player = ReturnType<typeof usePlayer>;

export function Controls({ p }: { p: Player }) {
  const { state, view } = p;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Playback controls" data-testid="scene-controls">
      <Button type="button" onClick={p.togglePlay} className="h-11 md:h-9" data-testid="scene-play" aria-label={state.done ? "Replay" : state.playing ? "Pause" : "Play"}>
        {state.done ? <RotateCcw aria-hidden /> : state.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        {state.done ? "Replay" : state.playing ? "Pause" : "Play"}
      </Button>
      <div className="flex items-center" role="group" aria-label="Speed">
        {SPEEDS.map((v) => (
          <Button key={v} type="button" variant={state.speed === v ? "secondary" : "ghost"} aria-pressed={state.speed === v} onClick={() => p.speed(v)} className="h-11 px-2.5 md:h-9" data-testid={`scene-speed-${v}`}>{v}×</Button>
        ))}
      </div>
      <Button type="button" variant="ghost" onClick={p.skip} disabled={view.stage === "verdict"} className="h-11 md:h-9" data-testid="scene-skip"><FastForward aria-hidden /> Skip to verdict</Button>
      <Button type="button" variant="ghost" onClick={p.replay} className="h-11 md:h-9" data-testid="scene-replay"><RotateCcw aria-hidden /> Replay</Button>
      <div className="min-w-20 flex-1 sm:max-w-40"><Meter value={view.progress} tone="info" label={`${Math.round(view.progress * 100)}% of the session played`} /></div>
    </div>
  );
}

const segment: Record<Vote, string> = { for: "bg-success-fill", conditional: "bg-brand", against: "bg-danger-fill" };

/** The vote and, once the chair speaks, the verdict: one clean panel. */
export function BoardPanel({ view, script }: { view: SceneView; script: readonly Beat[] }) {
  const total = script.filter((b) => b.kind === "vote").length;
  const voted = view.tally.for + view.tally.conditional + view.tally.against;
  const verdict = script.find((b): b is Extract<Beat, { kind: "verdict" }> => b.kind === "verdict");
  const dissent = script.find((b): b is Extract<Beat, { kind: "dissent" }> => b.kind === "dissent");
  const actions = script.find((b): b is Extract<Beat, { kind: "actions" }> => b.kind === "actions");
  const rows: Vote[] = ["for", "conditional", "against"];
  return (
    <GlassPanel as="aside" aria-label="Vote and verdict" className="space-y-6 p-5" data-testid="scene-board">
      <section aria-labelledby="scene-score" data-testid="scene-scoreboard" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="scene-score" className="font-heading text-base font-medium text-ink">Vote</h2>
          <span className="tabular text-[12px] text-ink-muted">{voted} of {total}</span>
        </div>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
          {rows.map((v) => <div key={v} className={cn("h-full rounded-full transition-[flex-grow] duration-base ease-standard", segment[v])} style={{ flexGrow: view.tally[v], flexBasis: 0 }} />)}
        </div>
        <ul className="grid grid-cols-3 gap-2 text-center">
          {rows.map((v) => (
            <li key={v} data-testid={`score-${v}`}>
              <span className="block font-heading text-2xl leading-none font-semibold text-ink tabular"><AnimatedNumber value={view.tally[v]} kind="count" /></span>
              <span className="mt-1 block text-[12px] text-ink-muted">{VOTE_LABEL[v]}</span>
            </li>
          ))}
        </ul>
      </section>
      {view.reveal.verdict && verdict && (
        <section aria-labelledby="scene-verdict-h" className="kc-enter space-y-4 border-t border-hairline pt-5" data-testid="scene-verdict">
          <h2 id="scene-verdict-h" className="font-heading text-base font-medium text-ink">Verdict</h2>
          <p className="font-heading text-lg leading-snug text-ink">{verdict.text}</p>
          {view.reveal.dissent && dissent && (
            <div className="kc-enter space-y-1.5" data-testid="scene-dissent">
              <h3 className="text-sm font-medium text-ink">Dissent</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">{dissent.items.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {view.reveal.actions > 0 && actions && (
            <div className="space-y-2" data-testid="scene-actions">
              <h3 className="text-sm font-medium text-ink">Next 7 days, in priority order</h3>
              <ol className="space-y-2">
                {actions.items.slice(0, view.reveal.actions).map((a, i) => (
                  <li key={i} className="kc-enter text-sm">
                    <span className="font-medium text-ink">{i + 1}. {a.title}</span>
                    <span className="block text-[13px] text-ink-muted">{a.why}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </GlassPanel>
  );
}

/** Phone layout shared by all styles: a clean vertical conversation. `Mini` draws the style's small avatar. */
export function Conversation({ view, playing, Mini }: { view: SceneView; playing: boolean; Mini: (p: { who: AvatarWho; state: NodeState }) => React.ReactNode }) {
  const end = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (playing) end.current?.scrollIntoView({ block: "nearest" });
  }, [playing, view.feed.length, view.thinking]);
  const row = (item: FeedItem) => {
    if (item.kind === "react") return <li key={item.id} className="pl-12 text-[12px] text-ink-muted">{nameOf(item.who)} {REACTION_LABEL[item.reaction].toLowerCase()} · {nameOf(item.target)}</li>;
    if (item.kind === "vote") return <li key={item.id} className="pl-12 text-[12px] text-ink-muted">{nameOf(item.who)} votes: <span className="font-medium text-ink">{VOTE_LABEL[item.vote]}</span></li>;
    const who: AvatarWho = item.kind === "chair" ? "chair" : item.who;
    return (
      <li key={item.id} className="flex items-start gap-3">
        <span className="mt-0.5 size-9 shrink-0">{Mini({ who, state: item.streaming ? "speaking" : "idle" })}</span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-medium text-ink">{nameOf(who)}{item.kind === "speak" && item.round === 2 ? <span className="font-sans font-normal text-ink-muted"> · replying</span> : null}</p>
          <p className="text-[15px] leading-relaxed text-ink">{item.text}{item.streaming && <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-ink" />}</p>
        </div>
      </li>
    );
  };
  return (
    <ol className="space-y-4 md:hidden" aria-label="The conversation" data-testid="scene-conversation">
      {view.feed.map(row)}
      {view.thinking && (
        <li className="flex items-center gap-3" data-testid="scene-thinking">
          <span className="size-9 shrink-0">{Mini({ who: view.thinking, state: "thinking" })}</span>
          <span className="text-[13px] text-ink-muted">{nameOf(view.thinking)} is thinking…</span>
        </li>
      )}
      <li ref={end} aria-hidden />
    </ol>
  );
}

/** The caption text for the speaker, shared by the three desktop stages. */
export function captionOf(view: SceneView): { who: AvatarWho; text: string; streaming: boolean; thinking: boolean } | null {
  if (view.thinking) return { who: view.thinking, text: "", streaming: false, thinking: true };
  if (!view.bubble) return null;
  return { who: view.bubble.who, text: view.bubble.text, streaming: view.bubble.streaming, thinking: false };
}

export function Dots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex gap-1", className)}>
      {[0, 1, 2].map((d) => <span key={d} className="kc-think-dot inline-block size-1.5 rounded-full bg-ink-muted" style={{ "--d": d } as React.CSSProperties} />)}
    </span>
  );
}

export type StageProps = { view: SceneView; advisors: readonly import("@/lib/board/advisors").AdvisorKey[]; script: readonly Beat[] };
