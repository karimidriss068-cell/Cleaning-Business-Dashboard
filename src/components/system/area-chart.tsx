"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTweenSeries } from "@/lib/motion/hooks";
import { formatChartValue, type ChartFormat } from "@/lib/chart-format";

/** Rounds up to 1, 2, 2.5 or 5 x 10^n so axis ticks land on clean values. */
function niceCeiling(v: number): number {
  const exp = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * exp >= v) ?? 10;
  return step * exp;
}

/**
 * Chart default (CLAUDE.md): lines draw in, values ease when the data changes,
 * and hovering or arrowing along the chart shows a tooltip with the exact
 * value. Area chart for a daily series (e.g. revenue over 30 days). SVG with
 * hairline gridlines, three y-axis labels, sparse x labels, an accent
 * gradient fill, a line that draws in once and a glowing end point.
 * Labels are HTML so they don't stretch with the chart.
 */
export function AreaChart({
  values,
  labels,
  format,
  height = 220,
  ariaLabel,
  className,
}: {
  values: number[];
  /** One label per value (e.g. "Oct 3"); a few are shown along the x axis. */
  labels: string[];
  format: ChartFormat;
  height?: number;
  ariaLabel: string;
  className?: string;
}) {
  const shown = useTweenSeries(values);
  const [active, setActive] = useState<number | null>(null);
  const w = 1000;
  const h = 300;
  const n = values.length;
  const max = niceCeiling(Math.max(...values, 1));
  const vs = shown.length === n ? shown : values;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v: number) => h - (v / max) * h;
  const line = vs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const ticks = [max, max / 2, 0];
  const xIdx = n > 1 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : [0];
  const last = n ? [x(n - 1), y(vs[n - 1])] : null;
  const at = active === null ? null : [x(active), y(vs[active])];

  return (
    <figure
      className={cn("relative outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
        else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
        else if (e.key === "Escape") setActive(null);
      }}
      onBlur={() => setActive(null)}
    >
      <div
        className="relative"
        style={{ height }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const left = r.left + 68; // the 4.25rem label gutter
          const f = (e.clientX - left) / Math.max(1, r.right - left);
          setActive(f < 0 || f > 1 || n < 2 ? null : Math.round(f * (n - 1)));
        }}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t, i) => (
          <div key={i} className="absolute inset-x-0 flex items-center gap-3" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
            <span className="w-14 shrink-0 -translate-y-1/2 text-right text-[11px] text-ink-muted tabular">{formatChartValue(t, format)}</span>
            <span className="h-px flex-1 -translate-y-1/2 bg-hairline" />
          </div>
        ))}
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="absolute top-0 right-0 bottom-0 left-[4.25rem] h-full w-[calc(100%-4.25rem)] overflow-visible text-brand">
          <defs>
            <linearGradient id="kc-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.32} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#kc-area-fill)" className="animate-[kc-fade_900ms_var(--kc-ease-enter)_both]" />
          <path
            d={line}
            pathLength={1}
            strokeDasharray="1"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className="animate-[kc-draw_1400ms_var(--kc-ease-enter)_both]"
          />
        </svg>
        {at && active !== null && (
          <>
            <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-px bg-brand/40" style={{ left: `calc(4.25rem + (100% - 4.25rem) * ${at[0] / w})` }} />
            <span aria-hidden className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-surface" style={{ left: `calc(4.25rem + (100% - 4.25rem) * ${at[0] / w})`, top: `${(at[1] / h) * 100}%` }} />
            <span
              aria-hidden
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-sm border border-hairline glass-popover px-2.5 py-1.5 text-center text-[12px] whitespace-nowrap text-ink tabular"
              style={{ left: `clamp(3rem, calc(4.25rem + (100% - 4.25rem) * ${at[0] / w}), calc(100% - 3rem))`, top: -4, transform: "translate(-50%, -100%)" }}
            >
              <span className="block text-ink-muted">{labels[active]}</span>
              <span className="block font-medium">{formatChartValue(values[active], format)}</span>
            </span>
          </>
        )}
        {last && !at && (
          <span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 animate-[kc-fade_600ms_var(--kc-ease-enter)_1100ms_both] rounded-full bg-brand shadow-[0_0_0_4px_var(--kc-glow),0_0_18px_var(--kc-glow)]"
            style={{ left: `calc(4.25rem + (100% - 4.25rem) * ${last[0] / w})`, top: `${(last[1] / h) * 100}%` }}
          />
        )}
      </div>
      <div className="mt-2 ml-[4.25rem] flex justify-between text-[11px] text-ink-muted">
        {xIdx.map((i) => (
          <span key={i} className="tabular">{labels[i]}</span>
        ))}
      </div>
    </figure>
  );
}
