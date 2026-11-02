"use client";

import { useId } from "react";
import { CHAIR_SEAT, seatPositions } from "@/lib/board/scene/layout";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { Glyph, TONE, type AvatarWho, type NodeState } from "@/components/board/scene/glyphs";
import { Dots, REACTION_LABEL, VOTE_LABEL, captionOf, focusOf, nameOf, reactionTone, stateOf, voteTone, type StageProps } from "@/components/board/scene/shared";

// Style A, "Holo command deck": a dark glass room, a holographic table with a luminous ring, advisors as
// orbs of light drawn with thin line geometry, a cone of light on whoever is speaking, a faint particle
// field and quiet mono readouts. Everything not speaking recedes.

const PARTICLES = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37 + 11) % 160, y: (i * 53 + 7) % 100, r: 0.22 + ((i * 7) % 5) * 0.07, d: i % 9 }));

export function OrbA({ who, state = "idle", index = 0, className }: { who: AvatarWho; state?: NodeState; index?: number; className?: string }) {
  const gid = useId();
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={nameOf(who)} className={cn("block overflow-visible", TONE[who], className)} data-state={state}>
      <defs>
        <radialGradient id={gid}>
          <stop offset="0" className="kc-stop-a" stopOpacity={state === "idle" ? 0.6 : 0.85} />
          <stop offset="1" className="kc-stop-a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#${gid})`} className="kc-halo" style={{ "--i": index } as React.CSSProperties} />
      {state === "speaking" && [0, 1].map((d) => <circle key={d} cx="50" cy="50" r="26" className="kc-ripple fill-none stroke-(--char)" strokeWidth="0.8" style={{ "--d": d } as React.CSSProperties} />)}
      {state === "thinking" && <circle cx="50" cy="50" r="35" className="kc-spin fill-none stroke-(--char)" strokeWidth="1" strokeDasharray="2 7" style={{ "--spin": "3s" } as React.CSSProperties} />}
      <circle cx="50" cy="50" r="27" className="fill-none stroke-(--char)" strokeWidth="1.4" />
      <g className="kc-spin" style={{ "--spin": state === "speaking" ? "24s" : "90s" } as React.CSSProperties}>
        <Glyph who={who} width={2} />
      </g>
      <circle cx="50" cy="50" r="3" className="fill-(--char)" />
    </svg>
  );
}

export const MiniA = ({ who, state }: { who: AvatarWho; state: NodeState }) => <OrbA who={who} state={state} className="size-full" />;

function Seat({ who, pos, props, index }: { who: AvatarWho; pos: { x: number; y: number }; props: StageProps; index: number }) {
  const { view } = props;
  const focus = focusOf(view);
  const state = stateOf(view, who);
  const vote = who === "chair" ? undefined : view.votes[who];
  const reacting = view.reaction && view.reaction.actor === who ? view.reaction : null;
  const recede = focus !== null && focus !== who;
  return (
    <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${pos.x}%`, top: `${pos.y}%` }} data-testid={`seat-${who}`} data-state={state}>
      {reacting && (
        <span className="kc-enter absolute -top-8 z-20 whitespace-nowrap" data-testid="scene-reaction">
          <StatusPill tone={reactionTone[reacting.reaction]}>{REACTION_LABEL[reacting.reaction]} · {nameOf(reacting.target)}</StatusPill>
        </span>
      )}
      <OrbA who={who} state={state} index={index} className={cn("transition-[transform,opacity] duration-500 ease-out", who === "chair" ? "w-[clamp(68px,7vw,96px)]" : "w-[clamp(56px,5.6vw,80px)]", focus === who && "scale-[1.22]", recede && "scale-90 opacity-70")} />
      <span className={cn("mt-0.5 max-w-28 text-center leading-tight transition-colors", focus === who ? "font-heading text-sm font-medium text-ink" : "text-[11px] text-ink-muted")}>{nameOf(who)}</span>
      {vote && <span className="kc-enter mt-1"><StatusPill tone={voteTone[vote]}>{VOTE_LABEL[vote]}</StatusPill></span>}
    </div>
  );
}

export function StageA(props: StageProps) {
  const { view, advisors } = props;
  const seats = seatPositions(advisors.length);
  const all: { who: AvatarWho; pos: { x: number; y: number } }[] = [{ who: "chair", pos: CHAIR_SEAT }, ...advisors.map((k, i) => ({ who: k, pos: seats[i] }))];
  const focus = focusOf(view);
  const cap = captionOf(view);
  const total = props.script.filter((b) => b.kind === "vote").length;
  const voted = view.tally.for + view.tally.conditional + view.tally.against;
  return (
    <GlassPanel level="solid" className="relative hidden aspect-[16/10] w-full overflow-hidden md:block" data-testid="scene-stage" data-style="a">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_65%_at_50%_58%,color-mix(in_oklab,var(--kc-accent)_16%,transparent),transparent)]" />
      <svg aria-hidden viewBox="0 0 160 100" className="absolute inset-0 size-full">
        {PARTICLES.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} className="kc-float fill-brand" style={{ "--d": p.d } as React.CSSProperties} />)}
        <g className="fill-none stroke-ink/30" strokeWidth="0.35" strokeLinecap="round">
          <path d="M5 14 V5 H14 M155 14 V5 H146 M5 86 V95 H14 M155 86 V95 H146" />
          <path d="M5 50 H9 M151 50 H155" />
        </g>
        <ellipse cx="80" cy="56" rx="49" ry="21.5" className="fill-brand/5 stroke-brand drop-shadow-[0_0_1.6px_var(--kc-glow)]" strokeWidth="0.5" />
        <ellipse cx="80" cy="56" rx="43" ry="18.5" className="kc-flow fill-none stroke-ink/25" strokeWidth="0.25" strokeDasharray="1.2 2.4" />
        <path d="M78 56 H82 M80 54 V58" className="stroke-ink/40" strokeWidth="0.3" />
      </svg>
      {all.map(({ who, pos }) => (
        <div key={who} aria-hidden className="pointer-events-none absolute top-0 w-[20%] -translate-x-1/2 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--kc-accent)_30%,transparent),transparent)] transition-opacity duration-500" style={{ left: `${pos.x}%`, height: `${pos.y + 9}%`, opacity: focus === who ? 1 : 0, clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)" }} />
      ))}
      <p className="absolute top-8 left-10 font-mono text-[11px] text-ink-muted tabular">session {Math.round(view.progress * 100)}%</p>
      <p className="absolute bottom-8 left-10 font-mono text-[11px] text-ink-muted tabular">votes {voted}/{total}</p>
      <p className="absolute top-8 right-10 font-mono text-[11px] text-ink-muted">{focus ? `focus: ${nameOf(focus).toLowerCase()}` : "focus: none"}</p>
      <div className="absolute top-[56%] left-1/2 w-[min(42%,23rem)] -translate-x-1/2 -translate-y-1/2 text-center" role="status" aria-live="polite" data-testid="scene-caption" data-speaker={cap?.who ?? ""}>
        {cap && (
          <>
            <p className="font-heading text-[15px] font-medium text-brand-text">{nameOf(cap.who)}{cap.thinking ? " is thinking" : ""}</p>
            {cap.thinking ? <Dots className="mt-2" /> : <p className={cn("mt-1 leading-relaxed text-ink", cap.text.length > 150 ? "text-[15px]" : "text-[17px]")}>{cap.text}{cap.streaming && <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-ink" />}</p>}
          </>
        )}
      </div>
      {all.map(({ who, pos }, i) => <Seat key={who} who={who} pos={pos} props={props} index={i} />)}
    </GlassPanel>
  );
}
