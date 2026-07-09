import { cn } from "@/lib/utils";

/** Placeholder for the PageHeader that each page.tsx renders itself, so
 * loading.tsx doesn't jump when the real header mounts. */
export function HeaderSkeleton() {
  return (
    <div className="border-b border-border px-6 py-5">
      <div className="skeleton h-7 w-48" />
      <div className="skeleton mt-2 h-4 w-72" />
    </div>
  );
}

/** A row of card-shaped placeholders, matching StatCard/SupportingStat sizing. */
export function StatGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel-glass px-6 py-6">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-4 h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A single large hero-shaped placeholder. */
export function HeroSkeleton() {
  return (
    <div className="panel-glass px-8 py-10 sm:px-10 sm:py-11">
      <div className="skeleton h-3 w-40" />
      <div className="skeleton mt-4 h-16 w-64" />
    </div>
  );
}

/** A chart-shaped placeholder. */
export function ChartSkeleton() {
  return (
    <div className="panel-glass px-6 py-7">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-6 h-52 w-full" />
    </div>
  );
}

/** A table-shaped placeholder — header bar + N row bars inside a glass panel. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="panel-glass overflow-hidden p-0">
      <div className="space-y-3 p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Standard list-page loading shell: header + table. */
export function ListPageSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-10 p-6 sm:p-8">
        <TableSkeleton />
      </div>
    </>
  );
}

/** Standard detail-page loading shell: header + hero + stat grid + table. */
export function DetailPageSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-10 p-6 sm:space-y-12 sm:p-8">
        <HeroSkeleton />
        <StatGridSkeleton count={3} />
        <TableSkeleton rows={4} />
      </div>
    </>
  );
}
