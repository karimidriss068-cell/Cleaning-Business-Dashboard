"use client";

import { motion } from "framer-motion";

type TooltipPayloadItem = {
  dataKey: string;
  value: number;
};

/**
 * Recharts tooltip pill — cream text on crimson, with a drop shadow and a
 * quick spring-like pop via framer-motion (Recharts keeps this component
 * mounted and just toggles `active`, so the transition is driven by
 * `animate` reacting to that prop rather than mount/unmount).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  const visible = !!active && !!payload?.length;
  const value = payload?.[0]?.value ?? 0;

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      initial={false}
      animate={
        visible
          ? { opacity: 1, scale: 1, y: 0 }
          : { opacity: 0, scale: 0.92, y: 4 }
      }
      transition={{ duration: 0.16, ease: "easeOut" }}
      style={{ pointerEvents: "none" }}
    >
      <div className="rounded-full bg-[var(--accent-bright)] px-3 py-1 text-xs font-semibold tabular-nums text-[var(--text-primary)] shadow-[0_6px_20px_-4px_rgba(184,41,61,0.6)]">
        {formatter ? formatter(value) : value}
      </div>
      {label && (
        <div className="rounded bg-[var(--bg-surface-raised)] px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
    </motion.div>
  );
}
