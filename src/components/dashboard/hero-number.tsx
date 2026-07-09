"use client";

import { useEffect, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { cn } from "@/lib/utils";
import { money, num, pct, duration } from "@/lib/format";

const FORMATTERS = { money, num, pct, duration } as const;

const SIZE_CLASSES = {
  mega: "text-[4.25rem] sm:text-[6rem] leading-[0.95] tracking-[-0.02em] font-semibold",
  lg: "text-[2.25rem] sm:text-[2.75rem] tracking-[-0.01em] font-medium",
  md: "text-[1.875rem] tracking-[-0.01em] font-medium",
  sm: "text-[1.5rem] font-medium",
} as const;

/**
 * The animated numeral — counts up via a real framer-motion spring/ease
 * (not a CSS transition) on mount or value change. Size and accent are
 * driven by editorial hierarchy: `mega` is the one dominant number per page.
 */
export function HeroNumber({
  value,
  format,
  size = "lg",
  accent = "crimson",
  className,
}: {
  value: string | number;
  format?: keyof typeof FORMATTERS;
  size?: keyof typeof SIZE_CLASSES;
  accent?: "crimson" | "cream" | "muted";
  className?: string;
}) {
  const isNumeric = typeof value === "number" && !!format;
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useMotionValueEvent(mv, "change", (v) => setDisplay(v));

  useEffect(() => {
    if (!isNumeric) return;
    const target = value as number;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      mv.set(target);
      return;
    }
    const controls = animate(mv, target, {
      duration: size === "mega" ? 0.9 : 0.65,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isNumeric]);

  const rendered = isNumeric ? FORMATTERS[format!](display) : value;

  return (
    <span
      className={cn(
        "relative z-10 inline-block font-heading",
        SIZE_CLASSES[size],
        accent === "cream"
          ? "text-cream-rich"
          : accent === "muted"
            ? "text-[var(--text-muted)]"
            : "text-[var(--text-primary)]",
        className,
      )}
    >
      {rendered}
    </span>
  );
}
