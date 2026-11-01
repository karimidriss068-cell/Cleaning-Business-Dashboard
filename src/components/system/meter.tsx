import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

const fillClass: Record<Tone, string> = {
  neutral: "bg-ink-muted",
  info: "bg-linear-to-r from-brand/60 to-brand shadow-[0_0_12px_var(--kc-glow)]",
  success: "bg-success-fill",
  warning: "bg-warning",
  danger: "bg-danger",
  secondary: "bg-accent2",
};

/**
 * A progress bar that grows from the left once (transform only, instant under
 * reduced motion). `marker` draws a tick where you should be by now, so pace
 * reads at a glance; the numbers always sit next to it in text.
 */
export function Meter({
  value,
  marker,
  tone = "info",
  label,
  className,
}: {
  /** 0 to 1; anything over 1 shows as full. */
  value: number;
  marker?: number;
  tone?: Tone;
  label: string;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn("relative h-2 overflow-hidden rounded-full bg-surface-raised", className)}
    >
      <div
        className={cn("h-full rounded-full", fillClass[tone])}
        style={{ width: `${pct}%`, transformOrigin: "left", animation: "kc-grow-x var(--kc-duration-enter) var(--kc-ease-enter) both" }}
      />
      {marker !== undefined && marker > 0 && marker < 1 && (
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-ink/70" style={{ left: `${Math.round(marker * 100)}%` }} />
      )}
    </div>
  );
}
