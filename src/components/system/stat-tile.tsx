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

/** KPI tile: label, tabular value, delta (icon + signed text) and a sparkline. */
export function StatTile({
  label,
  value,
  delta,
  hint,
  spark,
  href,
  className,
}: {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  spark?: number[];
  href?: string;
  className?: string;
}) {
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : ArrowRight;
  const body = (
    <>
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="font-heading text-[32px] leading-9 font-medium text-ink tabular">{value}</span>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      <div className="flex min-h-5 flex-wrap items-center gap-x-2 text-[13px]">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular",
              delta.direction === "flat" ? "text-ink-muted" : delta.good ? "text-success" : "text-danger",
            )}
          >
            <DeltaIcon className="size-3.5" aria-hidden />
            {delta.label}
          </span>
        )}
        {hint && <span className="text-ink-muted">{hint}</span>}
      </div>
    </>
  );
  const frame = cn(
    "flex flex-col gap-2 rounded-md border border-border bg-surface p-4 shadow-e1",
    href && "transition-colors duration-fast hover:border-border-input",
    className,
  );
  return href ? (
    <Link href={href} className={frame}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
