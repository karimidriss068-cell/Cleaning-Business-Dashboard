import { cn } from "@/lib/utils";

/**
 * Area chart for a daily series (e.g. revenue over 30 days). SVG with
 * hairline gridlines, three y-axis labels, sparse x labels, an accent
 * gradient fill, a line that draws in once and a glowing end point.
 * Labels are HTML so they don't stretch with the chart.
 */
export function AreaChart({
  values,
  labels,
  formatValue,
  height = 220,
  ariaLabel,
  className,
}: {
  values: number[];
  /** One label per value (e.g. "Oct 3"); a few are shown along the x axis. */
  labels: string[];
  formatValue: (v: number) => string;
  height?: number;
  ariaLabel: string;
  className?: string;
}) {
  const w = 1000;
  const h = 300;
  const n = values.length;
  const max = Math.max(...values, 1) * 1.12;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v: number) => h - (v / max) * h;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const ticks = [max, max / 2, 0];
  const xIdx = n > 1 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : [0];
  const last = values.length ? [x(n - 1), y(values[n - 1])] : null;

  return (
    <figure className={cn("relative", className)} role="img" aria-label={ariaLabel}>
      <div className="relative" style={{ height }}>
        {ticks.map((t, i) => (
          <div key={i} className="absolute inset-x-0 flex items-center gap-3" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
            <span className="w-14 shrink-0 -translate-y-1/2 text-right text-[11px] text-ink-muted tabular">{formatValue(t)}</span>
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
        {last && (
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
