"use client";

import { cn } from "@/lib/utils";
import { useTweenSeries } from "@/lib/motion/hooks";

// Stable id for the SVG gradient, derived from the data.
function gradientId(values: number[]): string {
  let h = 0;
  for (const ch of values.join(",")) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `kc-spark-${(h >>> 0).toString(36)}`;
}

/**
 * Inline SVG trend line (DESIGN.md section 10). Draws itself once on load
 * (instant under reduced motion), fills to a soft accent gradient and ends in
 * a glowing dot. Decorative: aria-hidden, the tile's text carries the meaning.
 */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  delayMs = 0,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  delayMs?: number;
  className?: string;
}) {
  const shown = useTweenSeries(values);
  const pad = 3;
  const n = values.length;
  const id = gradientId(values);
  values = shown.length === n ? shown : values;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => [
    pad + (n > 1 ? (i * (width - pad * 2)) / (n - 1) : (width - pad * 2) / 2),
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${points[n - 1][0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z` : "";
  const last = points[n - 1];
  const delay = { animationDelay: `${delayMs}ms` };

  return (
    <svg aria-hidden viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={cn("shrink-0 overflow-visible text-brand", className)}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      {n > 1 && <path d={area} fill={`url(#${id})`} className="animate-[kc-fade_var(--kc-duration-enter)_var(--kc-ease-enter)_both]" style={delay} />}
      {n > 1 && (
        <path
          d={line}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="1"
          className="animate-[kc-draw_1100ms_var(--kc-ease-enter)_both]"
          style={delay}
        />
      )}
      {last && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={3}
          fill="currentColor"
          className="animate-[kc-fade_var(--kc-duration-enter)_var(--kc-ease-enter)_both] drop-shadow-[0_0_6px_var(--kc-glow)]"
          style={{ animationDelay: `${delayMs + 700}ms` }}
        />
      )}
    </svg>
  );
}
