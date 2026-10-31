"use client";

import { formatCents } from "@/lib/format";
import { useInView, useTween } from "@/lib/motion/hooks";

export type NumberKind = "cents" | "percent" | "count";

/** Pure so it can be tested: how a value of each kind reads. */
export function formatFigure(value: number, kind: NumberKind, options: { hideZeroCents?: boolean } = {}): string {
  switch (kind) {
    case "cents":
      return formatCents(Math.round(value), options);
    case "percent":
      return `${Math.round(value)}%`;
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

/**
 * A number that counts up the first time it is seen and eases to each new
 * value. Money is passed as integer cents and formatted by formatCents; the
 * final text is what the server renders and what assistive tech reads, and an
 * invisible copy of it reserves the width so counting never shifts layout.
 * Under reduced motion it just shows the value.
 */
export function AnimatedNumber({
  value,
  kind = "count",
  hideZeroCents,
  className,
}: {
  value: number;
  kind?: NumberKind;
  hideZeroCents?: boolean;
  className?: string;
}) {
  const [ref, seen] = useInView<HTMLSpanElement>(0.2);
  // Before it is seen it shows the final text (server render, no flash); the
  // first time it comes into view it counts up from zero.
  const shown = useTween(value, { from: seen ? 0 : null, active: seen });
  const final = formatFigure(value, kind, { hideZeroCents });
  const text = seen ? formatFigure(shown, kind, { hideZeroCents }) : final;
  return (
    <span ref={ref} className={className} style={{ display: "inline-grid" }}>
      <span aria-hidden style={{ gridArea: "1 / 1", visibility: "hidden" }}>{final}</span>
      <span aria-hidden style={{ gridArea: "1 / 1" }}>{text}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
