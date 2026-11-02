"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FastForward, Pause, Play, RotateCcw } from "lucide-react";
import { ADVISORS, AI_LABEL, advisorByKey, type AdvisorKey } from "@/lib/board/advisors";
import { CHAIR_SEAT, seatPositions } from "@/lib/board/scene/layout";
import { deriveView, initialPlayer, pause, play, replay, seek, setSpeed, skipToVerdict, SPEEDS, tick, type FeedItem, type PlayerState, type SceneView } from "@/lib/board/scene/player";
import { REACTION_LABEL, VOTE_LABEL, type Beat, type Reaction, type Vote } from "@/lib/board/scene/script";
import { useReducedMotion } from "@/lib/motion/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { Avatar, type AvatarState, type AvatarWho } from "@/components/board/scene/avatars";
import type { Tone } from "@/lib/status";

const nameOf = (who: AvatarWho) => (who === "chair" ? "Chair" : advisorByKey(who).name);
const voteTone: Record<Vote, Tone> = { for: "success", conditional: "info", against: "danger" };
const reactionTone: Record<Reaction, Tone> = { agrees: "success", pushes_back: "danger", adds_condition: "info" };

/** Drives playback from the clock. Pure logic lives in lib/board/scene/player.ts. */
function usePlayer(script: readonly Beat[], start: { beat: number; progress: number; paused: boolean }) {
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

function Controls({ p }: { p: ReturnType<typeof usePlayer> }) {
  const { state, view } = p;
  return (
    <GlassPanel level="flat" className="flex flex-wrap items-center gap-2 p-2.5" role="group" aria-label="Playback controls" data-testid="scene-controls">
      <Button type="button" onClick={p.togglePlay} className="h-11 md:h-9" data-testid="scene-play" aria-label={state.done ? "Replay" : state.playing ? "Pause" : "Play"}>
        {state.done ? <RotateCcw aria-hidden /> : state.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        {state.done ? "Replay" : state.playing ? "Pause" : "Play"}
      </Button>
      <div className="flex items-center gap-1" role="group" aria-label="Speed">
        {SPEEDS.map((v) => (
          <Button key={v} type="button" variant={state.speed === v ? "secondary" : "ghost"} aria-pressed={state.speed === v} onClick={() => p.speed(v)} className="h-11 px-2.5 md:h-9" data-testid={`scene-speed-${v}`}>{v}×</Button>
        ))}
      </div>
      <Button type="button" variant="ghost" onClick={p.skip} disabled={view.stage === "verdict"} className="h-11 md:h-9" data-testid="scene-skip"><FastForward aria-hidden /> Skip to verdict</Button>
      <Button type="button" variant="ghost" onClick={p.replay} className="h-11 md:h-9" data-testid="scene-replay"><RotateCcw aria-hidden /> Replay</Button>
      <div className="ml-auto min-w-24 flex-1 sm:max-w-56"><Meter value={view.progress} tone="info" label={`${Math.round(view.progress * 100)}% of the session played`} /></div>
    </GlassPanel>
  );
}

function Scoreboard({ view, total }: { view: SceneView; total: number }) {
  const voted = view.tally.for + view.tally.conditional + view.tally.against;
  const rows: { vote: Vote; label: string; bar: string }[] = [
    { vote: "for", label: "Yes", bar: "bg-success-fill" },
    { vote: "conditional", label: "Yes, if…", bar: "bg-brand" },
    { vote: "against", label: "No", bar: "bg-danger-fill" },
  ];
  const lead = rows.slice().sort((a, b) => view.tally[b.vote] - view.tally[a.vote])[0];
  return (
    <GlassPanel as="section" aria-labelledby="scene-score" className="space-y-3 p-4" data-testid="scene-scoreboard">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="scene-score" className="font-heading text-base font-medium text-ink">Score board</h2>
        <span className="tabular text-[12px] text-ink-muted">{voted} of {total} voted</span>
      </div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.vote} className="space-y-1" data-testid={`score-${r.vote}`}>
            <div className="flex items-center justify-between text-sm"><span className="text-ink">{r.label}</span><span className="tabular font-medium text-ink"><AnimatedNumber value={view.tally[r.vote]} kind="count" /></span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
              <div className={cn("h-full origin-left rounded-full transition-transform duration-base ease-standard", r.bar)} style={{ transform: `scaleX(${total === 0 ? 0 : view.tally[r.vote] / total})` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-ink-muted" aria-live="polite">{voted === 0 ? "Votes appear as each advisor commits." : `Leaning: ${lead.label}${view.tally[lead.vote] === voted ? " (all so far)" : ""}.`}</p>
    </GlassPanel>
  );
}

function VerdictPanel({ view, script }: { view: SceneView; script: readonly Beat[] }) {
  const verdict = script.find((b): b is Extract<Beat, { kind: "verdict" }> => b.kind === "verdict");
  const dissent = script.find((b): b is Extract<Beat, { kind: "dissent" }> => b.kind === "dissent");
  const actions = script.find((b): b is Extract<Beat, { kind: "actions" }> => b.kind === "actions");
  if (!view.reveal.verdict || !verdict) return null;
  return (
    <GlassPanel as="section" level="popover" aria-labelledby="scene-verdict" className="kc-enter space-y-4 p-5" data-testid="scene-verdict">
      <h2 id="scene-verdict" className="flex flex-wrap items-center gap-2 font-heading text-lg font-medium text-ink">The chair&apos;s verdict <StatusPill tone="secondary">AI chair</StatusPill></h2>
      <p className="text-base font-medium text-ink">{verdict.text}</p>
      {view.reveal.dissent && dissent && (
        <div className="kc-enter" data-testid="scene-dissent">
          <h3 className="text-sm font-medium text-ink">Dissent</h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-muted">{dissent.items.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      {view.reveal.actions > 0 && actions && (
        <div data-testid="scene-actions">
          <h3 className="text-sm font-medium text-ink">Next 7 days: 3 actions, in priority order</h3>
          <ol className="mt-2 space-y-2">
            {actions.items.slice(0, view.reveal.actions).map((a, i) => (
              <li key={i} className="kc-enter rounded-md bg-surface-raised p-3 text-sm ring-1 ring-hairline" style={{ "--i": 0 } as React.CSSProperties}>
                <span className="font-medium text-ink">{i + 1}. {a.title}</span>
                <span className="block text-[13px] text-ink-muted">{a.why}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </GlassPanel>
  );
}

function Bubble({ view }: { view: SceneView }) {
  const b = view.bubble;
  const thinking = view.thinking;
  const who: AvatarWho | null = thinking ?? b?.who ?? null;
  if (!who) return null;
  return (
    <GlassPanel level="popover" className="pointer-events-none w-[min(88%,25rem)] space-y-1 p-3.5 text-left" role="status" aria-live="polite" data-testid="scene-bubble" data-speaker={who}>
      <p className="flex items-center gap-2 text-[12px] font-medium text-brand-text">{nameOf(who)}{thinking ? " is thinking" : b?.streaming ? " is speaking" : ""}</p>
      {thinking ? (
        <p className="text-sm text-ink-muted" aria-hidden>
          {[0, 1, 2].map((d) => <span key={d} className="kc-think-dot mx-0.5 inline-block size-1.5 rounded-full bg-ink-muted" style={{ "--d": d } as React.CSSProperties} />)}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-ink">{b?.text}{b?.streaming && <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-ink" />}</p>
      )}
    </GlassPanel>
  );
}

function Seat({ who, pos, state, view, index }: { who: AvatarWho; pos: { x: number; y: number }; state: AvatarState; view: SceneView; index: number }) {
  const vote = who === "chair" ? undefined : view.votes[who];
  const reacting = view.reaction && view.reaction.actor === who ? view.reaction : null;
  const big = who === "chair";
  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} data-testid={`seat-${who}`} data-state={state}>
      {reacting && (
        <span className="kc-enter absolute -top-9 z-20 whitespace-nowrap" data-testid="scene-reaction">
          <StatusPill tone={reactionTone[reacting.reaction]}>{REACTION_LABEL[reacting.reaction]} · {nameOf(reacting.target)}</StatusPill>
        </span>
      )}
      {state !== "idle" && <span aria-hidden className="absolute top-0 -z-10 size-[130%] -translate-y-[12%] rounded-full bg-brand/25 blur-2xl" />}
      <Avatar who={who} state={state} index={index} title={nameOf(who)} className={big ? "w-[clamp(64px,6.4vw,92px)]" : "w-[clamp(54px,5.4vw,78px)]"} />
      <span className={cn("mt-1 max-w-28 text-center text-[11px] leading-tight font-medium", state === "idle" ? "text-ink-muted" : "text-ink")}>{nameOf(who)}</span>
      {vote && <span className="kc-enter mt-1"><StatusPill tone={voteTone[vote]}>{VOTE_LABEL[vote]}</StatusPill></span>}
    </div>
  );
}

function Table({ advisors, view }: { advisors: readonly AdvisorKey[]; view: SceneView }) {
  const seats = seatPositions(advisors.length);
  const stateOf = (who: AvatarWho): AvatarState => (view.thinking === who ? "thinking" : view.speaker === who ? "speaking" : "idle");
  return (
    <div className="relative hidden aspect-[16/10] w-full md:block" data-testid="scene-table" role="group" aria-label="The boardroom table">
      <div className="absolute top-[29%] left-1/2 h-[50%] w-[64%] -translate-x-1/2 [perspective:1100px]" aria-hidden>
        <GlassPanel level="solid" className="relative size-full rounded-[50%] [transform:rotateX(22deg)]">
          <span className="absolute inset-[7%] rounded-[50%] border border-hairline" />
        </GlassPanel>
      </div>
      <div className="absolute top-[52%] left-1/2 flex w-full -translate-x-1/2 -translate-y-1/2 justify-center">
        <Bubble view={view} />
      </div>
      <Seat who="chair" pos={CHAIR_SEAT} state={stateOf("chair")} view={view} index={0} />
      {advisors.map((k, i) => <Seat key={k} who={k} pos={seats[i]} state={stateOf(k)} view={view} index={i + 1} />)}
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "react") {
    return <li className="flex items-center gap-2 pl-12 text-[12px] text-ink-muted"><StatusPill tone={reactionTone[item.reaction]}>{REACTION_LABEL[item.reaction]}</StatusPill> {nameOf(item.who)} to {nameOf(item.target)}</li>;
  }
  if (item.kind === "vote") {
    return <li className="flex items-center gap-2 pl-12 text-[12px] text-ink-muted"><StatusPill tone={voteTone[item.vote]}>Vote: {VOTE_LABEL[item.vote]}</StatusPill> {nameOf(item.who)}</li>;
  }
  const who: AvatarWho = item.kind === "chair" ? "chair" : item.who;
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-raised ring-1 ring-hairline"><Avatar who={who} state={item.streaming ? "speaking" : "idle"} index={item.id} title={nameOf(who)} className="mt-2 w-7" /></span>
      <GlassPanel level="flat" className="min-w-0 flex-1 space-y-0.5 p-3">
        <p className="text-[12px] font-medium text-brand-text">{nameOf(who)}{item.kind === "speak" && item.round === 2 ? " · round 2" : ""}</p>
        <p className="text-sm text-ink">{item.text}{item.streaming && <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-ink" />}</p>
      </GlassPanel>
    </li>
  );
}

/** Phone layout: a vertical conversation with avatar chips, no table. */
function Conversation({ view, playing }: { view: SceneView; playing: boolean }) {
  const end = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (playing) end.current?.scrollIntoView({ block: "nearest" });
  }, [playing, view.feed.length, view.thinking]);
  return (
    <ol className="space-y-3 md:hidden" aria-label="The conversation" data-testid="scene-conversation">
      {view.feed.map((item) => <FeedRow key={item.id} item={item} />)}
      {view.thinking && (
        <li className="flex items-center gap-3" data-testid="scene-thinking">
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-raised ring-1 ring-hairline"><Avatar who={view.thinking} state="thinking" title={nameOf(view.thinking)} className="mt-2 w-7" /></span>
          <span className="text-[13px] text-ink-muted">{nameOf(view.thinking)} is thinking…</span>
        </li>
      )}
      <li ref={end} aria-hidden />
    </ol>
  );
}

export function Boardroom({ script, advisors, start = { beat: 0, progress: 0, paused: false } }: { script: readonly Beat[]; advisors: readonly AdvisorKey[]; start?: { beat: number; progress: number; paused: boolean } }) {
  const p = usePlayer(script, start);
  const { view, state } = p;
  const voters = script.filter((b) => b.kind === "vote").length;
  const lenses = ADVISORS.filter((a) => advisors.includes(a.key));
  return (
    <div className="space-y-4" data-testid="boardroom" data-beat={state.beat} data-stage={view.stage} data-playing={state.playing} data-done={state.done}>
      <p className="text-[12px] text-ink-muted" data-testid="scene-label">{AI_LABEL}</p>
      <Controls p={p} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <GlassPanel as="section" aria-label="Boardroom" className="overflow-hidden p-3 md:p-4">
          <Table advisors={advisors} view={view} />
          <Conversation view={view} playing={state.playing} />
        </GlassPanel>
        <div className="order-first space-y-4 lg:order-none">
          <Scoreboard view={view} total={voters} />
          <GlassPanel as="section" aria-label="Who is at the table" level="flat" className="hidden space-y-1.5 p-4 lg:block">
            <h2 className="text-sm font-medium text-ink">At the table</h2>
            <ul className="space-y-1 text-[12px] text-ink-muted">{lenses.map((a) => <li key={a.key}><span className="font-medium text-ink">{a.name}</span>: {a.question}</li>)}</ul>
          </GlassPanel>
        </div>
      </div>
      <VerdictPanel view={view} script={script} />
    </div>
  );
}
