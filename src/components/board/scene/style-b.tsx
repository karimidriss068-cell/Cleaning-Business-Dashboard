"use client";

import { useId } from "react";
import { ringPositions } from "@/lib/board/scene/layout";
import type { Vote } from "@/lib/board/scene/script";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/system/status-pill";
import { TONE, type AvatarWho, type NodeState } from "@/components/board/scene/glyphs";
import { Dots, REACTION_LABEL, VOTE_LABEL, captionOf, focusOf, nameOf, reactionTone, stateOf, voteTone, type StageProps } from "@/components/board/scene/shared";

// Style B, "Signal chamber": no characters. Each advisor is a glowing node on a ring. Speaking is an
// audio waveform around the node and light trails flowing to the others; the words are plain captions;
// a vote pulses once on the node and stays as a ring. Drawn in one SVG (160 x 112 units).

const W = 160;
const H = 126;
const CENTER = { x: 80, y: 47 };
const R = 30;
const BARS = 28;
const voteStroke: Record<Vote, string> = { for: "stroke-success-fill", conditional: "stroke-brand", against: "stroke-danger-fill" };

function Waveform({ r, bars = BARS }: { r: number; bars?: number }) {
  return (
    <g>
      {Array.from({ length: bars }, (_, i) => (
        <g key={i} transform={`rotate(${(i * 360) / bars})`}>
          <rect x="-0.25" y={-(r + 5.2)} width="0.5" height="4.4" rx="0.25" className="kc-wave fill-(--char)" style={{ "--d": i } as React.CSSProperties} />
        </g>
      ))}
    </g>
  );
}

function NodeGlyph({ who, state, vote, focused, receded }: { who: AvatarWho; state: NodeState; vote?: Vote; focused: boolean; receded: boolean }) {
  const r = who === "chair" ? 4.3 : 3.3;
  const gid = useId();
  return (
    <g className={cn("origin-center transition-[transform,opacity] duration-500 [transform-box:fill-box]", focused && "scale-[1.3]", receded && "opacity-60")}>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0" className="kc-stop-a" stopOpacity={state === "idle" ? 0.35 : 0.6} />
          <stop offset="1" className="kc-stop-a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r={r * 2.8} fill={`url(#${gid})`} className="kc-halo" />
      {state === "thinking" && <circle r={r + 1.8} className="kc-spin fill-none stroke-(--char)" strokeWidth="0.3" strokeDasharray="0.8 1.6" style={{ "--spin": "3s" } as React.CSSProperties} />}
      <circle r={r} className="fill-canvas stroke-(--char)" strokeWidth="0.5" />
      <circle r={r * 0.42} className="fill-(--char)" />
      {state === "speaking" && <Waveform r={r} />}
      {vote && (
        <>
          <circle r={r + 1.3} className={cn("fill-none", voteStroke[vote])} strokeWidth="0.55" />
          <circle key={vote} r={r + 1.3} className={cn("kc-pulse-once fill-none", voteStroke[vote])} strokeWidth="0.4" />
        </>
      )}
    </g>
  );
}

export function MiniB({ who, state }: { who: AvatarWho; state: NodeState }) {
  return (
    <svg viewBox="-9 -9 18 18" role="img" aria-label={nameOf(who)} className={cn("size-full overflow-visible", TONE[who])} data-state={state}>
      <circle r="6.5" className="fill-(--char)" opacity={state === "idle" ? 0.12 : 0.25} />
      <circle r="3.6" className="fill-canvas stroke-(--char)" strokeWidth="0.6" />
      <circle r="1.5" className="fill-(--char)" />
      {state === "speaking" && <Waveform r={3.6} bars={14} />}
    </svg>
  );
}

const pct = (p: { x: number; y: number }) => ({ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` });

export function StageB(props: StageProps) {
  const { view, advisors } = props;
  const seats = ringPositions(advisors.length, CENTER, { x: R, y: R });
  const all: { who: AvatarWho; pos: { x: number; y: number } }[] = [{ who: "chair", pos: { x: CENTER.x, y: CENTER.y - R } }, ...advisors.map((k, i) => ({ who: k, pos: seats[i] }))];
  const at = (who: AvatarWho) => all.find((a) => a.who === who)?.pos ?? CENTER;
  const focus = focusOf(view);
  const cap = captionOf(view);
  const trail = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const cx = ((a.x + b.x) / 2) * 0.35 + CENTER.x * 0.65;
    const cy = ((a.y + b.y) / 2) * 0.35 + CENTER.y * 0.65;
    return `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`;
  };
  return (
    <div className="relative hidden aspect-[16/12.6] w-full md:block" data-testid="scene-stage" data-style="b">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(48%_50%_at_50%_43%,color-mix(in_oklab,var(--kc-accent)_9%,transparent),transparent)]" />
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible">
        <circle cx={CENTER.x} cy={CENTER.y} r={R} className="fill-none stroke-ink/15" strokeWidth="0.25" />
        <circle cx={CENTER.x} cy={CENTER.y} r={R - 7} className="fill-none stroke-ink/8" strokeWidth="0.2" strokeDasharray="0.6 2" />
        {focus && all.filter((a) => a.who !== focus).map((a) => (
          <path key={a.who} d={trail(at(focus), a.pos)} className="kc-flow fill-none stroke-brand/30" strokeWidth="0.3" strokeDasharray="1.2 2.4" />
        ))}
        {view.reaction && <path d={trail(at(view.reaction.target), at(view.reaction.actor))} className="kc-flow fill-none stroke-brand drop-shadow-[0_0_1.2px_var(--kc-glow)]" strokeWidth="0.6" strokeDasharray="1.4 2" />}
        {all.map(({ who, pos }) => (
          <g key={who} transform={`translate(${pos.x} ${pos.y})`} className={TONE[who]}>
            <NodeGlyph who={who} state={stateOf(view, who)} vote={who === "chair" ? undefined : view.votes[who]} focused={focus === who} receded={focus !== null && focus !== who} />
          </g>
        ))}
      </svg>
      {all.map(({ who, pos }) => {
        const above = pos.y < CENTER.y - 4;
        const vote = who === "chair" ? undefined : view.votes[who];
        const reacting = view.reaction && view.reaction.actor === who ? view.reaction : null;
        const state = stateOf(view, who);
        return (
          <div key={who} className={cn("absolute flex w-32 -translate-x-1/2 flex-col items-center gap-1 text-center", above ? (focus === who ? "-translate-y-full pb-[4.75rem]" : "-translate-y-full pb-10") : focus === who ? "pt-[4.75rem]" : "pt-10")} style={pct(pos)} data-testid={`seat-${who}`} data-state={state}>
            {above && reacting && <ReactionChip reacting={reacting} />}
            {above && vote && <VoteChip vote={vote} />}
            <span className={cn("leading-tight", focus === who ? "font-heading text-sm font-medium text-ink" : "text-[11px] text-ink-muted")}>{nameOf(who)}</span>
            {!above && vote && <VoteChip vote={vote} />}
            {!above && reacting && <ReactionChip reacting={reacting} />}
          </div>
        );
      })}
      <div className="absolute inset-x-0 top-[79%] mx-auto w-[min(92%,36rem)] text-center" role="status" aria-live="polite" data-testid="scene-caption" data-speaker={cap?.who ?? ""}>
        {cap && (
          <>
            <p className="font-heading text-sm font-medium text-brand-text">{nameOf(cap.who)}{cap.thinking ? " is thinking" : ""}</p>
            {cap.thinking ? <Dots className="mt-2" /> : <p className="mt-1 text-lg leading-snug text-ink">{cap.text}{cap.streaming && <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-ink" />}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function ReactionChip({ reacting }: { reacting: NonNullable<StageProps["view"]["reaction"]> }) {
  return <span className="kc-enter whitespace-nowrap" data-testid="scene-reaction"><StatusPill tone={reactionTone[reacting.reaction]}>{REACTION_LABEL[reacting.reaction]} · {nameOf(reacting.target)}</StatusPill></span>;
}
function VoteChip({ vote }: { vote: Vote }) {
  return <span className="kc-enter"><StatusPill tone={voteTone[vote]}>{VOTE_LABEL[vote]}</StatusPill></span>;
}
