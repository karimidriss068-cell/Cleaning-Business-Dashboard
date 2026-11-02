"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { layoutStream, ribbonPath, type StreamSeries } from "@/lib/vault/stream";

const W = 720;
const H = 220;
const RANGES = [{ weeks: 4, label: "4 weeks" }, { weeks: 8, label: "8 weeks" }, { weeks: 13, label: "13 weeks" }] as const;
// Calm, desaturated tones from the direction's chart tokens; no yellow.
const TONES = [
  "var(--kc-chart1)",
  "var(--kc-chart2)",
  "color-mix(in oklab, var(--kc-text) 62%, var(--kc-chart1))",
  "var(--kc-chart4)",
  "var(--kc-chart3)",
  "color-mix(in oklab, var(--kc-accent) 50%, var(--kc-chart2))",
];

const dollars = (c: number) => formatCents(Math.round(c / 100) * 100, { hideZeroCents: true });
const day = (d: string) => formatCalendarDate(d).replace(/, \d{4}$/, "");

/**
 * Revenue by channel as flowing glass ribbons: one smooth ribbon per channel,
 * widening and narrowing across the weeks. Hover a ribbon or a legend row to
 * isolate that channel; move across to read a week. No rotating, no 3D.
 */
export function ChannelStream({ weeks, series, ariaLabel }: { weeks: string[]; series: StreamSeries[]; ariaLabel: string }) {
  const [range, setRange] = useState<number>(13);
  const [hot, setHot] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  const n = Math.min(range, weeks.length);
  const view = useMemo(() => series.map((s) => ({ ...s, values: s.values.slice(-n) })).filter((s) => s.values.some((v) => v > 0)), [series, n]);
  const { layers } = useMemo(() => layoutStream(view, W, H, 6), [view]);
  const shownWeeks = weeks.slice(-n);
  const total = view.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
  const toneOf = (key: string) => TONES[series.findIndex((s) => s.key === key) % TONES.length];
  const hotSeries = view.find((s) => s.key === hot);
  const cols = Math.max(2, shownWeeks.length);
  const xAt = (i: number) => 6 + (i * (W - 12)) / (cols - 1);

  const readout = (() => {
    const week = at !== null ? shownWeeks[Math.min(at, shownWeeks.length - 1)] : null;
    if (hotSeries) {
      const v = at !== null ? hotSeries.values[Math.min(at, hotSeries.values.length - 1)] : hotSeries.values.reduce((a, b) => a + b, 0);
      return `${hotSeries.label} · ${at !== null && week ? `week of ${day(week)}` : `${n} weeks`} · ${dollars(v)}`;
    }
    if (at !== null && week) return `Week of ${day(week)} · ${dollars(view.reduce((a, s) => a + s.values[Math.min(at, s.values.length - 1)], 0))}`;
    return `${dollars(total)} in ${n} weeks`;
  })();

  return (
    <div data-testid="channel-stream" data-hot={hot ?? ""}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-heading text-xl font-medium text-ink tabular" data-testid="stream-readout" aria-live="polite">{readout}</p>
        <div role="radiogroup" aria-label="Time range" className="inline-flex items-center rounded-full p-0.5">
          {RANGES.map((r) => (
            <button key={r.weeks} type="button" role="radio" aria-checked={range === r.weeks} data-testid={`stream-range-${r.weeks}`} onClick={() => setRange(r.weeks)} className={cn("kc-press h-7 rounded-full px-3 text-[13px] transition-colors", range === r.weeks ? "bg-surface-raised/80 text-ink" : "text-ink-muted hover:text-ink")}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid items-center gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
            className="block h-[220px] w-full"
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAt(Math.min(cols - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (cols - 1)))));
            }}
            onPointerLeave={() => {
              setAt(null);
              setHot(null);
            }}
          >
            <defs>
              {layers.map((l) => (
                <linearGradient key={l.key} id={`${uid}-${l.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={toneOf(l.key)} stopOpacity="0.78" />
                  <stop offset="1" stopColor={toneOf(l.key)} stopOpacity="0.4" />
                </linearGradient>
              ))}
              <linearGradient id={`${uid}-sheen`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--kc-text)" stopOpacity="0.22" />
                <stop offset="0.55" stopColor="var(--kc-text)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="kc-stream-in" key={`${n}-${view.length}`}>
              {layers.map((l, i) => {
                const d = ribbonPath(l);
                const dim = hot !== null && hot !== l.key;
                return (
                  <g key={l.key} data-ribbon={l.key} style={{ opacity: dim ? 0.14 : 1, transition: "opacity 420ms var(--kc-ease-standard)" }} onPointerEnter={() => setHot(l.key)}>
                    <path d={d} fill={`url(#${uid}-${l.key})`} style={{ animationDelay: `${i * 90}ms` }} />
                    <path d={d} fill={`url(#${uid}-sheen)`} />
                    <path d={d} fill="none" stroke="var(--kc-text)" strokeOpacity="0.22" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </g>
            {at !== null && <line x1={xAt(at)} x2={xAt(at)} y1={0} y2={H} stroke="var(--kc-text)" strokeOpacity="0.35" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="mt-1 flex justify-between text-[12px] text-ink-muted">
            <span>{day(shownWeeks[0])}</span>
            <span>{day(shownWeeks[shownWeeks.length - 1])}</span>
          </div>
        </div>
        <ul className="space-y-0.5" data-testid="stream-legend">
          {[...view].sort((a, b) => b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0)).map((s) => {
            const t = s.values.reduce((x, y) => x + y, 0);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onPointerEnter={() => setHot(s.key)}
                  onPointerLeave={() => setHot(null)}
                  onFocus={() => setHot(s.key)}
                  onBlur={() => setHot(null)}
                  className={cn("kc-press flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm transition-colors", hot === s.key ? "bg-surface-raised/70" : "hover:bg-surface-raised/40")}
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: toneOf(s.key) }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
                  <span className="text-ink-muted tabular">{dollars(t)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
