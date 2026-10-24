import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export type Delta = {
  /** Already formatted with its sign, e.g. "+12%" or "−3". */
  label: string;
  direction: "up" | "down" | "flat";
  /** Whether this change is good news (colors it success or danger). */
  good: boolean;
};

/**
 * KPI tile: layered surface with a hairline and a lit top edge, a large
 * tabular numeral with a restrained glow, a signed delta (icon + text, never
 * color alone) and a sparkline that draws in. `index` staggers its entrance.
 */
export function StatTile({
  label,
  value,
  delta,
  hint,
  spark,
  href,
  index = 0,
  className,
}: {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  spark?: number[];
  href?: string;
  index?: number;
  className?: string;
}) {
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : ArrowRight;
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-brand/60 to-transparent" />
      <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{label}</span>
      <div className="flex items-end justify-between gap-4">
        <span className="font-heading text-[40px] leading-[44px] font-medium tracking-[-0.02em] text-ink tabular text-glow">{value}</span>
        {spark && spark.length > 1 && <Sparkline values={spark} delayMs={150 + index * 55} className="mb-1.5" />}
      </div>
      <div className="flex min-h-6 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-muted">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap tabular ring-1 ring-inset",
              delta.direction === "flat"
                ? "text-ink-muted ring-hairline"
                : delta.good
                  ? "bg-success-soft text-success ring-success/25"
                  : "bg-danger-soft text-danger ring-danger/25",
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden />
            {delta.label}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </>
  );
  const frame = cn(
    "kc-enter relative flex flex-col gap-3 overflow-hidden rounded-md border border-hairline bg-surface surface-layer p-5 shadow-e1",
    href && "transition-[border-color,transform] duration-base ease-standard hover:-translate-y-0.5 hover:border-brand/40",
    className,
  );
  const style = { "--i": index } as React.CSSProperties;
  return href ? (
    <Link href={href} className={frame} style={style}>
      {body}
    </Link>
  ) : (
    <div className={frame} style={style}>
      {body}
    </div>
  );
}
