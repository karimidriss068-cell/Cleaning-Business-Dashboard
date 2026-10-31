"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTweenSeries } from "@/lib/motion/hooks";
import { formatChartValue, type ChartFormat } from "@/lib/chart-format";

/**
 * Chart default for categorical or daily bars: bars grow from the baseline
 * once (staggered), ease to new values, and hovering or arrowing shows the
 * exact value. Same axis and tooltip look as AreaChart.
 */
export function BarChart({
  values,
  labels,
  format,
  height = 200,
  ariaLabel,
  className,
}: {
  values: number[];
  labels: string[];
  format: ChartFormat;
  height?: number;
  ariaLabel: string;
  className?: string;
}) {
  const shown = useTweenSeries(values);
  const [active, setActive] = useState<number | null>(null);
  const n = values.length;
  const vs = shown.length === n ? shown : values;
  const max = Math.max(...values, 1);
  const step = (i: number) => (n > 1 ? Math.round((n - 1) * (i / 3)) : 0);
  return (
    <figure
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cn("relative outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
        else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
        else if (e.key === "Escape") setActive(null);
      }}
      onBlur={() => setActive(null)}
    >
      <div className="relative flex items-end gap-1 border-b border-hairline" style={{ height }} onPointerLeave={() => setActive(null)}>
        {vs.map((v, i) => (
          <div key={i} className="relative flex h-full flex-1 items-end" onPointerEnter={() => setActive(i)}>
            <span
              aria-hidden
              className={cn("w-full origin-bottom rounded-t-xs bg-brand/70 transition-colors duration-fast kc-grow", active === i && "bg-brand")}
              style={{ height: `${(v / max) * 100}%`, animationDelay: `${i * 18}ms` }}
            />
            {active === i && (
              <span aria-hidden className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-sm border border-hairline glass-popover px-2.5 py-1.5 text-center text-[12px] whitespace-nowrap text-ink tabular">
                <span className="block text-ink-muted">{labels[i]}</span>
                <span className="block font-medium">{formatChartValue(values[i], format)}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className="tabular">{labels[step(k)]}</span>
        ))}
      </div>
    </figure>
  );
}
