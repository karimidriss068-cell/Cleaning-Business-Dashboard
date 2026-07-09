import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A designed empty state for any list/table with zero rows — icon in the
 * brand palette, a human sentence, and an optional CTA. Used instead of
 * bare "No X yet" text.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)]">
        <Icon className="h-5 w-5 text-[var(--accent-bright)]" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
