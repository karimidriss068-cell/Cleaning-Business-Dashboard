"use client";

import { useId } from "react";
import { ringPositions } from "@/lib/board/scene/layout";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { Glyph, TONE, type AvatarWho, type NodeState } from "@/components/board/scene/glyphs";
import { Dots, REACTION_LABEL, VOTE_LABEL, captionOf, focusOf, nameOf, reactionTone, stateOf, voteTone, type StageProps } from "@/components/board/scene/shared";

// Style C, "Glass orbit": advisors are semi-abstract figures in frosted glass capsules that drift round a
// glowing core (the chair). Whoever speaks is pushed toward the camera; everyone else softens and
// blurs. While the votes come in, nobody is singled out.

const CENTER = { x: 50, y: 32 };
const RADIUS = { x: 35, y: 24 };

/** A semi-abstract figure: a halo glyph over a head and shoulders, drawn in thin line with a soft body. */
export function Figure({ who, state = "idle" }: { who: AvatarWho; state?: NodeState }) {
  const gid = useId();
  return (
    <svg viewBox="0 0 50 80" role="img" aria-label={nameOf(who)} className={cn("block size-full", TONE[who])} data-state={state}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="kc-stop-a" stopOpacity="0.1" />
          <stop offset="1" className="kc-stop-a" stopOpacity={state === "idle" ? 0.35 : 0.6} />
        </linearGradient>
      </defs>
      <path d="M8 76 C8 56 16 49 25 49 C34 49 42 56 42 76 Z" fill={`url(#${gid})`} className="stroke-(--char)" strokeWidth="0.8" />
      <circle cx="25" cy="35" r="8.5" className={cn("fill-(--char)/15 stroke-(--char)", state === "thinking" && "kc-halo")} strokeWidth="0.9" />
      <g transform="translate(25 14) scale(0.3) translate(-50 -50)"><Glyph who={who} width={3} /></g>
    </svg>
  );
}

export const MiniC = ({ who, state }: { who: AvatarWho; state: NodeState }) => (
  <span className={cn("block size-full overflow-hidden rounded-full border border-hairline bg-linear-to-b from-ink/10 to-surface-raised/40 px-1.5 pt-1.5", TONE[who], state === "speaking" && "shadow-[0_0_12px_var(--kc-glow)]")}><Figure who={who} state={state} /></span>
);

export function StageC(props: StageProps) {
  const { view, advisors } = props;
  const seats = ringPositions(advisors.length, CENTER, RADIUS);
  const ys = seats.map((s) => s.y);
  const [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
  const depth = (y: number) => (yMax === yMin ? 1 : 0.84 + 0.26 * ((y - yMin) / (yMax - yMin)));
  const focus = focusOf(view);
  const cap = captionOf(view);
  const pos = (who: AvatarWho) => (who === "chair" ? CENTER : seats[advisors.indexOf(who)]);
  // Camera push-in: scale the whole orbit about the speaker, and slide it a little toward the middle of the
  // stage, so the speaker comes forward while everyone else stays in frame.
  const cam = focus ? (() => { const p = pos(focus); const s = focus === "chair" ? 1.06 : 1.1; return { origin: `${p.x}% ${p.y}%`, transform: `translate(${-(p.x - 50) * 0.12}%, ${-(p.y - CENTER.y) * 0.12}%) scale(${s})` }; })() : { origin: "50% 50%", transform: "none" };
  const bodyOf = (who: AvatarWho) => cn("transition-[filter,opacity,transform] duration-700 ease-out", focus !== null && focus !== who && "scale-[0.92] opacity-75 blur-[1.5px] saturate-60");
  return (
    <GlassPanel level="flat" className="relative hidden aspect-[16/11] w-full overflow-hidden md:block" data-testid="scene-stage" data-style="c">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(55%_55%_at_50%_44%,color-mix(in_oklab,var(--kc-accent)_14%,transparent),transparent)]" />
      <div className="absolute inset-0 transition-[transform,transform-origin] duration-[1100ms] ease-[cubic-bezier(0.22,0.7,0.2,1)]" style={{ transform: cam.transform, transformOrigin: cam.origin }}>
        <svg aria-hidden viewBox="0 0 160 110" className="absolute inset-0 size-full">
          <ellipse cx="80" cy={CENTER.y * 1.1} rx={RADIUS.x * 1.6} ry={RADIUS.y * 1.1} className="fill-none stroke-ink/15" strokeWidth="0.25" />
          <ellipse cx="80" cy={CENTER.y * 1.1} rx={RADIUS.x * 1.1} ry={RADIUS.y * 0.75} className="fill-none stroke-ink/10" strokeWidth="0.2" strokeDasharray="0.6 2" />
        </svg>
        {/* the core: the chair */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${CENTER.x}%`, top: `${CENTER.y}%`, zIndex: 1 }} data-testid="seat-chair" data-state={stateOf(view, "chair")}>
          <div className={cn(TONE.chair, bodyOf("chair"))}>
            <div className="relative grid size-[clamp(72px,8vw,108px)] place-items-center">
              {stateOf(view, "chair") === "speaking" && [0, 1].map((d) => <span key={d} aria-hidden className="kc-ripple absolute inset-0 rounded-full border border-brand" style={{ "--d": d } as React.CSSProperties} />)}
              <span aria-hidden className="kc-halo absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklab,var(--kc-text)_70%,transparent),color-mix(in_oklab,var(--kc-accent)_55%,transparent)_38%,color-mix(in_oklab,var(--kc-accent)_10%,transparent)_70%,transparent)] shadow-[0_0_46px_var(--kc-glow)]" />
              <svg aria-hidden viewBox="0 0 100 100" className="relative size-1/2"><Glyph who="chair" width={4} /></svg>
            </div>
          </div>
          <span className="mt-1 block text-center text-[11px] leading-tight text-ink-muted">Chair</span>
        </div>
        {advisors.map((k, i) => {
          const p = seats[i];
          const state = stateOf(view, k);
          const vote = view.votes[k];
          const reacting = view.reaction && view.reaction.actor === k ? view.reaction : null;
          return (
            <div key={k} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%`, zIndex: Math.round(p.y) }} data-testid={`seat-${k}`} data-state={state}>
              <div className="kc-orbit-drift relative flex flex-col items-center" style={{ "--i": i } as React.CSSProperties}>
                {reacting && <span className="kc-enter absolute -top-8 z-20 whitespace-nowrap" data-testid="scene-reaction"><StatusPill tone={reactionTone[reacting.reaction]}>{REACTION_LABEL[reacting.reaction]} · {nameOf(reacting.target)}</StatusPill></span>}
                <div className={bodyOf(k)} style={{ scale: depth(p.y) }}>
                  <div className={cn("w-[clamp(46px,4.8vw,66px)] aspect-[5/8] overflow-hidden rounded-full border bg-linear-to-b from-ink/12 to-surface-raised/30 shadow-e1 backdrop-blur-md", state === "idle" ? "border-hairline" : "border-brand shadow-[0_0_26px_var(--kc-glow)]")}>
                    <Figure who={k} state={state} />
                  </div>
                </div>
                <span className={cn("mt-1 max-w-28 text-center leading-tight", focus === k ? "font-heading text-sm font-medium text-ink" : "text-[11px] text-ink-muted")}>{nameOf(k)}</span>
                {vote && (
                  // Beside the capsule on the outer side, so the capsule below never hides it; centred seats keep it underneath.
                  <span className={cn("kc-enter", Math.abs(p.x - 50) < 8 ? "mt-1" : cn("absolute top-1/3 whitespace-nowrap", p.x < 50 ? "right-full mr-2" : "left-full ml-2"))}>
                    <StatusPill tone={voteTone[vote]}>{VOTE_LABEL[vote]}</StatusPill>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <GlassPanel level="popover" className="absolute bottom-3 left-1/2 w-[min(84%,32rem)] -translate-x-1/2 p-4" role="status" aria-live="polite" data-testid="scene-caption" data-speaker={cap?.who ?? ""}>
        {cap ? (
          <>
            <p className="font-heading text-sm font-medium text-brand-text">{nameOf(cap.who)}{cap.thinking ? " is thinking" : ""}</p>
            {cap.thinking ? <Dots className="mt-2" /> : <p className="mt-1 text-base leading-relaxed text-ink">{cap.text}{cap.streaming && <span aria-hidden className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-ink" />}</p>}
          </>
        ) : <p className="text-sm text-ink-muted">Waiting for the chair.</p>}
      </GlassPanel>
    </GlassPanel>
  );
}
