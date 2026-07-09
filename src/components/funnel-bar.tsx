"use client";

import { motion } from "framer-motion";
import { FUNNEL_STAGES, STAGE_LABELS, type Funnel } from "@/lib/outreach";

/**
 * Compact 5-bar funnel: each stage's height is its share of everyone contacted,
 * so you can see WHERE a script leaks, not just its final number. The closed
 * stage is crimson (the outcome that matters); the rest are muted cream.
 * Bars draw in from zero height on mount (or when the underlying funnel
 * changes) rather than just appearing.
 */
export function FunnelBar({ funnel }: { funnel: Funnel }) {
  const rates = [
    1,
    funnel.replyRate,
    funnel.callBookedRate,
    funnel.callHeldRate,
    funnel.closeRate,
  ];
  const counts = [
    funnel.contacted,
    funnel.replied,
    funnel.call_booked,
    funnel.call_held,
    funnel.closed,
  ];

  return (
    <div className="flex h-8 w-32 items-end gap-1 rounded-md bg-[color-mix(in_srgb,var(--bg-panel)_55%,transparent)] px-1.5 py-1">
      {FUNNEL_STAGES.map((stage, i) => (
        <div
          key={stage}
          className="flex h-full flex-1 items-end"
          title={`${STAGE_LABELS[stage]}: ${counts[i]}`}
        >
          <motion.div
            className={
              i === FUNNEL_STAGES.length - 1
                ? "w-full rounded-sm bg-[var(--accent-primary)]"
                : "w-full rounded-sm bg-[color-mix(in_srgb,var(--text-muted)_45%,transparent)]"
            }
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(rates[i] * 100, 5)}%` }}
            transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      ))}
    </div>
  );
}
