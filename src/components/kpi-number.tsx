"use client";

import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/use-count-up";
import { money, num } from "@/lib/format";

const FORMATTERS = { money, num } as const;

/**
 * The animated numeral itself — count-up on mount, Fraunces display type,
 * and an underline that only glows/breathes for `hero` numbers (the single
 * most important metric on a view). Used standalone (SplitStat) or wrapped
 * in a full card (Stat).
 */
export function KpiNumber({
  value,
  format,
  hero = false,
  muted = false,
}: {
  value: string | number;
  format?: keyof typeof FORMATTERS;
  hero?: boolean;
  muted?: boolean;
}) {
  const isNumeric = typeof value === "number" && !!format;
  const animated = useCountUp(isNumeric ? (value as number) : 0);
  const rendered = isNumeric ? FORMATTERS[format!](animated) : value;

  return (
    <div className="relative inline-block">
      {hero && <div className="kpi-glow-blob" aria-hidden />}
      <span
        className={cn(
          "kpi-number relative z-10",
          hero ? "text-[3rem] sm:text-[3.5rem]" : "text-[1.75rem]",
          muted && "kpi-number--muted",
        )}
      >
        {rendered}
      </span>
      <div
        className={cn(
          "kpi-underline relative z-10",
          hero && "kpi-underline--glow",
          muted && !hero && "kpi-underline--muted",
        )}
      />
    </div>
  );
}
