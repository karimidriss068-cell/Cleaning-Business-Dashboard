import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon, title, one sentence, at most one action (DESIGN.md section 10). */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <span className="flex size-16 items-center justify-center rounded-full bg-canvas">
        <Icon aria-hidden className="size-8 text-brand-text" strokeWidth={1.75} />
      </span>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {children && <p className="max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
