import { cn } from "@/lib/utils";

export type StatListItem = { label: React.ReactNode; value: React.ReactNode };

/**
 * Compact 2-3 column grid of label/value pairs — the "supporting data"
 * treatment for a headline stat (Insights answer cards today; any future
 * card that needs a quick scannable breakdown instead of one StatCard per
 * number can reuse this).
 */
export function StatList({
  items,
  className,
}: {
  items: StatListItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3", className)}>
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="kpi-label truncate">{item.label}</dt>
          <dd className="font-data mt-1.5 truncate text-[15px] text-[var(--text-primary)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
