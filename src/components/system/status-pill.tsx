import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-raised text-ink-muted",
  info: "bg-info-soft text-brand-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  sand: "bg-sand text-ink",
};

const dotClass: Record<Tone, string> = {
  neutral: "bg-ink-muted",
  info: "bg-brand-text",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  sand: "bg-ink-muted",
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
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotClass[tone])} />
      {children}
    </span>
  );
}
