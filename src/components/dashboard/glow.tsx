"use client";

import { motion } from "framer-motion";

/**
 * Soft breathing glow blob sat behind a hero number, like backlit glass.
 * Only opacity/scale are animated (not color/box-shadow strings) so
 * framer-motion can interpolate them numerically without any parsing quirks
 * around `color-mix()`.
 */
export function GlowBlob({
  accent = "crimson",
  className,
}: {
  accent?: "crimson" | "cream";
  className?: string;
}) {
  const gradient =
    accent === "cream"
      ? "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent-cream-rich) 38%, transparent), transparent 70%)"
      : "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent-bright) 30%, transparent), transparent 70%)";

  return (
    <motion.div
      aria-hidden
      className={className ?? "pointer-events-none absolute -inset-x-[15%] -inset-y-[40%] -z-0"}
      style={{ background: gradient, filter: "blur(28px)" }}
      animate={{ opacity: [0.5, 0.95, 0.5], scale: [1, 1.08, 1] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/**
 * The underline beneath a hero number — a static color bar with a blurred
 * duplicate behind it whose opacity pulses, reading as a slow heartbeat glow.
 */
export function GlowUnderline({
  accent = "crimson",
  className,
}: {
  accent?: "crimson" | "cream" | "muted";
  className?: string;
}) {
  const color =
    accent === "cream"
      ? "var(--accent-cream-rich)"
      : accent === "muted"
        ? "color-mix(in srgb, var(--text-muted) 55%, transparent)"
        : "var(--accent-bright)";

  const glow = accent !== "muted";

  return (
    <div className={className ?? "relative mt-3 h-[2.5px]"}>
      {glow && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ background: color, filter: "blur(6px)" }}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className="relative h-full rounded-full" style={{ background: color }} />
    </div>
  );
}
