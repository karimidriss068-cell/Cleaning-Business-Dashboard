"use client";

import { cn } from "@/lib/utils";

/**
 * Subtle top-right usage badge — thin progress ring (queries used / cap)
 * plus estimated monthly cost. Replaces plain "3/50 queries" text.
 */
export function UsageRing({
  used,
  cap,
  costUsd,
  className,
}: {
  used: number;
  cap: number;
  costUsd: number;
  className?: string;
}) {
  const pct = cap > 0 ? Math.min(1, used / cap) : 0;
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-border bg-[var(--bg-surface)]/70 py-1 pr-3.5 pl-1",
        className,
      )}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90 shrink-0">
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="var(--accent-bright)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="leading-tight">
        <p className="font-data text-xs text-[var(--text-primary)]">
          {used}/{cap}
        </p>
        <p className="text-[10px] text-muted-foreground">~${costUsd.toFixed(2)} this mo.</p>
      </div>
    </div>
  );
}
