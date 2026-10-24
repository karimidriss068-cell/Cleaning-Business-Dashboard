import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-raised text-ink-muted ring-hairline",
  info: "bg-info-soft text-brand-text ring-brand/30",
  success: "bg-success-soft text-success ring-success/30",
  warning: "bg-warning-soft text-warning ring-warning/30",
  danger: "bg-danger-soft text-danger ring-danger/30",
  secondary: "bg-surface-raised text-ink ring-accent2/45",
};

const dotClass: Record<Tone, string> = {
  neutral: "bg-ink-muted",
  info: "bg-brand-text shadow-[0_0_6px_var(--kc-glow)]",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  secondary: "bg-accent2",
};

/** Status with a text label and a dot: never color alone (DESIGN.md section 10). */
export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotClass[tone])} />
      {children}
    </span>
  );
}
