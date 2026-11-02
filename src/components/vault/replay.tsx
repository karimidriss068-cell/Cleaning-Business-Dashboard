"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCalendarDate } from "@/lib/format";
import { paceLabel, paceTone } from "@/lib/status";
import type { ReplayFrame } from "@/lib/vault/replay";
import { stepSpring, type Spring } from "@/lib/vault/spring";
import { useFrameLoop } from "@/lib/vault/use-frame-loop";
import { useReducedMotion } from "@/lib/motion/hooks";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { DemoDataPill } from "@/components/growth/demo-pill";
import { money, paceSentence } from "@/components/growth/format";

type ReplayState = {
  frames: ReplayFrame[];
  index: number;
  last: number;
  /** True when the playhead is on the final (today) frame: screens then show their live figures. */
  live: boolean;
  playing: boolean;
  speed: number;
  includesDemo: boolean;
  seek: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  goLive: () => void;
};

const Ctx = createContext<ReplayState | null>(null);

/** The replay position, or null on a screen with no timeline. */
export const useReplay = () => useContext(Ctx);

const DAY_MS = 520;

/**
 * Holds the playhead for a page. The frames are real numbers built on the
 * server; scrubbing only changes which frame the screen reads from.
 */
export function ReplayProvider({ frames, includesDemo = false, children }: { frames: ReplayFrame[]; includesDemo?: boolean; children: React.ReactNode }) {
  const last = Math.max(0, frames.length - 1);
  const [index, setIndex] = useState(last);
  const [playing, setPlayingState] = useState(false);
  const [speed, setSpeed] = useState(1);
  const reduced = useReducedMotion();
  const idx = useRef(index);
  useEffect(() => {
    idx.current = index;
  }, [index]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (idx.current >= last) {
        setPlayingState(false);
        return;
      }
      setIndex(idx.current + 1);
    }, DAY_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, last]);

  const seek = useCallback((i: number) => {
    setPlayingState(false);
    setIndex(Math.min(last, Math.max(0, Math.round(i))));
  }, [last]);
  const setPlaying = useCallback((p: boolean) => {
    // Pressing play on the last day starts from the first, so it always does something.
    if (p && idx.current >= last) setIndex(0);
    setPlayingState(p);
  }, [last]);
  const goLive = useCallback(() => {
    setPlayingState(false);
    setIndex(last);
  }, [last]);

  const value = useMemo<ReplayState>(
    () => ({ frames, index, last, live: index === last, playing: playing && !reduced, speed, includesDemo, seek, setPlaying, setSpeed, goLive }),
    [frames, index, last, playing, reduced, speed, includesDemo, seek, setPlaying, goLive],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const weekday = (date: string) => formatCalendarDate(date).replace(/, \d{4}$/, "");

const W = 720;
const H = 132;
const PAD = { l: 6, r: 6, t: 10, b: 6 };

/** The replay panel: key figures that morph with the playhead, a bar-and-line timeline you can drag, and play/speed controls. */
export function ReplayDeck({ title = "Replay", description }: { title?: string; description?: string }) {
  const r = useReplay();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const tipPos = useRef<{ x: Spring; y: Spring }>({ x: { x: 0, v: 0 }, y: { x: 0, v: 0 } });
  const tipTarget = useRef({ x: 0, y: 0 });
  const reduced = useReducedMotion();

  const frames = r?.frames ?? [];
  const n = frames.length;
  const maxDay = Math.max(1, ...frames.map((f) => f.dayCents));
  const maxMtd = Math.max(1, ...frames.map((f) => f.monthToDateCents));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = n > 0 ? iw / n : iw;
  const xAt = (i: number) => PAD.l + bw * i + bw / 2;

  const mtdPath = useMemo(() => {
    let d = "";
    frames.forEach((f, i) => {
      const monthChanged = i > 0 && f.date.slice(0, 7) !== frames[i - 1].date.slice(0, 7);
      d += `${i === 0 || monthChanged ? "M" : "L"}${xAt(i).toFixed(1)},${(PAD.t + ih - (f.monthToDateCents / maxMtd) * ih).toFixed(1)}`;
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, maxMtd]);

  // The tooltip follows the pointer on a spring (magnetic), not glued to it.
  const wake = useFrameLoop((dt) => {
    const el = tip.current;
    if (!el) return false;
    const t = tipTarget.current;
    const p = tipPos.current;
    p.x = stepSpring(p.x, t.x, dt, 220, 24);
    p.y = stepSpring(p.y, t.y, dt, 220, 24);
    el.style.transform = `translate3d(${p.x.x.toFixed(1)}px,${p.y.x.toFixed(1)}px,0)`;
    return Math.abs(p.x.x - t.x) > 0.3 || Math.abs(p.y.x - t.y) > 0.3 || Math.abs(p.x.v) > 0.3;
  });

  if (!r || n === 0) return null;
  const f = frames[r.index];
  const idxFromEvent = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return r.index;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    return Math.min(n - 1, Math.max(0, Math.floor((x - PAD.l) / bw)));
  };
  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const i = idxFromEvent(e);
    setHover({ i, x: e.clientX - rect.left });
    tipTarget.current = { x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 44 };
    if (reduced) {
      tipPos.current = { x: { x: tipTarget.current.x, v: 0 }, y: { x: tipTarget.current.y, v: 0 } };
    }
    wake();
    if (e.buttons === 1) r.seek(i);
  };
  const hf = hover ? frames[hover.i] : null;

  return (
    <GlassPanel as="section" aria-labelledby="replay-title" className="kc-enter p-5 md:p-6" data-testid="replay-deck" data-replay-index={r.index} data-replay-live={r.live}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="replay-title" className="font-heading text-lg font-medium text-ink">{title}</h2>
          <p className="text-[13px] text-ink-muted">{description ?? "Drag across the last 30 days to watch the numbers and the pace change."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.includesDemo && <DemoDataPill />}
          <button
            type="button"
            onClick={() => r.setPlaying(!r.playing)}
            aria-label={r.playing ? "Pause replay" : "Play replay"}
            data-testid="replay-play"
            className="kc-press inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors duration-fast hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {r.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {r.playing ? "Pause" : "Play"}
          </button>
          <div role="radiogroup" aria-label="Replay speed" className="inline-flex items-center rounded-full border border-hairline bg-surface-raised/70 p-0.5">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={r.speed === s}
                onClick={() => r.setSpeed(s)}
                data-testid={`replay-speed-${s}`}
                className={cn("kc-press h-8 min-w-9 rounded-full px-2.5 text-[13px] font-medium tabular transition-colors duration-fast", r.speed === s ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink")}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={r.goLive}
            disabled={r.live}
            data-testid="replay-live"
            className="kc-press inline-flex h-9 items-center gap-1.5 rounded-full border border-hairline px-3 text-sm text-ink-muted transition-colors duration-fast enabled:hover:border-brand/40 enabled:hover:text-ink disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Back to today
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-[1.1fr_1fr_1fr_1fr_1.3fr]">
        <div data-testid="replay-date">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{r.live ? "Today" : "As of"}</p>
          <p className="font-heading text-[28px] leading-8 font-medium tracking-[-0.01em] text-ink">{weekday(f.date)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Revenue this month</p>
          <p className="font-heading text-[28px] leading-8 font-medium text-ink tabular text-glow" data-testid="replay-mtd"><AnimatedNumber value={Math.round(f.monthToDateCents / 100) * 100} kind="cents" hideZeroCents /></p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Visits that day</p>
          <p className="font-heading text-[28px] leading-8 font-medium text-ink tabular" data-testid="replay-visits"><AnimatedNumber value={f.visits} kind="count" /></p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">New leads that day</p>
          <p className="font-heading text-[28px] leading-8 font-medium text-ink tabular" data-testid="replay-leads"><AnimatedNumber value={f.newLeads} kind="count" /></p>
        </div>
        <div className="min-w-0" data-testid="replay-pace">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Pace</p>
          {f.pace ? (
            <div className="mt-1 space-y-1">
              <StatusPill tone={paceTone[f.pace.status]}>{paceLabel[f.pace.status]}</StatusPill>
              <p className="text-[13px] text-ink-muted tabular">{paceSentence(f.pace.daysAhead)} · plan {money(f.pace.milestoneCents)}</p>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-ink-muted">No plan month covers this day.</p>
          )}
        </div>
      </div>

      <div className="relative mt-5" onPointerLeave={() => setHover(null)}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[132px] w-full touch-none select-none cursor-ew-resize"
          role="img"
          aria-label={`Daily revenue for the last ${n} days. Playhead on ${weekday(f.date)}.`}
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            r.seek(idxFromEvent(e));
          }}
          onPointerMove={onMove}
        >
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih} y2={PAD.t + ih} className="stroke-hairline" strokeWidth={1} />
          {frames.map((fr, i) => {
            const h = Math.max(2, (fr.dayCents / maxDay) * ih);
            const past = i <= r.index;
            return (
              <rect
                key={fr.date}
                x={PAD.l + bw * i + bw * 0.16}
                width={bw * 0.68}
                y={PAD.t + ih - h}
                height={h}
                rx={2}
                className="kc-replay-bar"
                style={{ fill: "var(--kc-chart1)", opacity: past ? (hover?.i === i ? 1 : 0.78) : 0.16, transition: "opacity var(--kc-duration-base) var(--kc-ease-standard), y 380ms, height 380ms" }}
              />
            );
          })}
          <path d={mtdPath} fill="none" className="stroke-ink-muted" strokeWidth={1.25} vectorEffect="non-scaling-stroke" strokeDasharray="3 4" opacity={0.5} />
          <path d={mtdPath} fill="none" stroke="var(--kc-chart2)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" style={{ clipPath: `inset(0 ${W - xAt(r.index) - bw / 2}px 0 0)`, transition: "clip-path 380ms var(--kc-ease-standard)" }} />
          <g style={{ transform: `translateX(${xAt(r.index)}px)`, transition: "transform 380ms var(--kc-ease-standard)" }}>
            <line y1={PAD.t - 4} y2={PAD.t + ih} className="stroke-ink" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </g>
          {hover && <line x1={xAt(hover.i)} x2={xAt(hover.i)} y1={PAD.t} y2={PAD.t + ih} className="stroke-brand" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />}
        </svg>
        <span
          aria-hidden
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
          style={{ left: `${(xAt(r.index) / W) * 100}%`, top: `${((PAD.t + ih - (f.monthToDateCents / maxMtd) * ih) / H) * 132}px`, background: "var(--kc-chart2)", transition: "left 380ms var(--kc-ease-standard), top 380ms var(--kc-ease-standard)" }}
        />
        <div ref={tip} aria-hidden className={cn("pointer-events-none absolute top-0 left-0 z-10 rounded-sm border border-hairline glass-popover px-2.5 py-1.5 text-[12px] whitespace-nowrap text-ink tabular transition-opacity duration-fast", hf ? "opacity-100" : "opacity-0")}>
          {hf && (
            <>
              <span className="font-medium">{weekday(hf.date)}</span> · {money(hf.dayCents)}
              <span className="text-ink-muted"> · {hf.visits} visit{hf.visits === 1 ? "" : "s"}</span>
            </>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={r.last}
          step={1}
          value={r.index}
          onChange={(e) => r.seek(Number(e.target.value))}
          aria-label="Replay day"
          aria-valuetext={weekday(f.date)}
          data-testid="replay-range"
          className="kc-range mt-2 w-full"
        />
        <div className="mt-1 flex items-center justify-between text-[12px] text-ink-muted">
          <span>{weekday(frames[0].date)}</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm" style={{ background: "var(--kc-chart1)" }} />Revenue per day</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: "var(--kc-chart2)" }} />This month so far</span>
          </span>
          <span>{weekday(frames[n - 1].date)}</span>
        </div>
      </div>
    </GlassPanel>
  );
}
