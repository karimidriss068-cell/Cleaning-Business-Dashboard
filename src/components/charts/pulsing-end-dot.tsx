"use client";

import { motion } from "framer-motion";

/**
 * "Radar ping" marker at the last data point — a static dot with an
 * expanding, fading ring pulsing behind it. The chart's live-feeling
 * signature moment. Rendered via Recharts' <ReferenceDot shape={...}>,
 * which supplies computed pixel coordinates as cx/cy.
 */
export function PulsingEndDot({
  cx,
  cy,
  color = "var(--accent-bright)",
}: {
  cx?: number;
  cy?: number;
  color?: string;
}) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <motion.circle
        cx={cx}
        cy={cy}
        r={4}
        fill="none"
        stroke={color}
        strokeWidth={2}
        initial={{ opacity: 0.7 }}
        animate={{ r: [4, 12], opacity: [0.7, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--bg-panel)" strokeWidth={2} />
    </g>
  );
}
