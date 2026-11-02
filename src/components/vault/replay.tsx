"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCalendarDate } from "@/lib/format";
import { paceLabel, paceTone } from "@/lib/status";
import type { ReplayFrame } from "@/lib/vault/replay";
import { useReducedMotion } from "@/lib/motion/hooks";
import { AnimatedNumber } from "@/components/system/animated-number";
import { StatusPill } from "@/components/system/status-pill";

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

const W = 600;
const H = 28;

/**
 * The replay control: a slim strip with play, a faint revenue silhouette you
 * can drag, the day, and speed. The numbers it moves (revenue, visits, the
 * growth card, pace) are the ones already on the page, so the strip itself
 * stays quiet.
 */
export function ReplayDeck() {
  const r = useReplay();
  const svgRef = useRef<SVGSVGElement>(null);
  const frames = r?.frames ?? [];
  const n = frames.length;
  const maxDay = Math.max(1, ...frames.map((f) => f.dayCents));
  const bw = n > 0 ? W / n : W;

  if (!r || n === 0) return null;
  const f = frames[r.index];
  const idxFromEvent = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return r.index;
    return Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * n)));
  };

  return (
    <section aria-label="Replay" className="kc-enter flex flex-wrap items-center gap-x-5 gap-y-3 rounded-3xl border border-hairline/60 px-3 py-2 md:rounded-full md:px-4" data-testid="replay-deck" data-replay-index={r.index} data-replay-live={r.live}>
      <button
        type="button"
        onClick={() => r.setPlaying(!r.playing)}
        aria-label={r.playing ? "Pause replay" : "Play replay"}
        data-testid="replay-play"
        className="kc-press grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised/80 text-ink hover:bg-surface-raised"
      >
        {r.playing ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
      </button>
      <div className="relative order-last min-w-0 basis-full md:order-none md:basis-0 md:flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
          className="block h-7 w-full cursor-ew-resize touch-none select-none"
          onPointerDown={(e) => {
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            r.seek(idxFromEvent(e));
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) r.seek(idxFromEvent(e));
          }}
        >
          {frames.map((fr, i) => {
            const h = Math.max(1.5, (fr.dayCents / maxDay) * (H - 4));
            return <rect key={fr.date} x={bw * i + bw * 0.2} width={bw * 0.6} y={H - h} height={h} rx={1} style={{ fill: "var(--kc-chart1)", opacity: i <= r.index ? 0.55 : 0.14, transition: "opacity 600ms var(--kc-ease-standard)" }} />;
          })}
        </svg>
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
          className="kc-range w-full"
        />
      </div>
      <p className="min-w-0 text-[13px] whitespace-nowrap text-ink-muted tabular" data-testid="replay-date">
        <span className="text-ink">{r.live ? "Today" : weekday(f.date)}</span>
        <span data-testid="replay-mtd"> · <AnimatedNumber value={Math.round(f.monthToDateCents / 100) * 100} kind="cents" hideZeroCents /> this month</span>
      </p>
      <p className="min-w-0 text-[13px] text-ink-muted" data-testid="replay-pace" data-visible={!r.live || undefined}>
        {f.pace ? <StatusPill tone={paceTone[f.pace.status]}>{paceLabel[f.pace.status]}</StatusPill> : "No plan month"}
      </p>
      <div className="ml-auto flex items-center gap-1">
        <div role="radiogroup" aria-label="Replay speed" className="inline-flex items-center">
          {[1, 2, 4].map((s) => (
            <button key={s} type="button" role="radio" aria-checked={r.speed === s} onClick={() => r.setSpeed(s)} data-testid={`replay-speed-${s}`} className={cn("kc-press h-7 min-w-8 rounded-full px-2 text-[12px] tabular transition-colors", r.speed === s ? "bg-surface-raised/80 text-ink" : "text-ink-muted hover:text-ink")}>
              {s}×
            </button>
          ))}
        </div>
        <button type="button" onClick={r.goLive} disabled={r.live} data-testid="replay-live" className="kc-press inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] text-ink-muted transition-colors enabled:hover:text-ink disabled:opacity-40">
          <RotateCcw className="size-3" aria-hidden /> Today
        </button>
      </div>
    </section>
  );
}
