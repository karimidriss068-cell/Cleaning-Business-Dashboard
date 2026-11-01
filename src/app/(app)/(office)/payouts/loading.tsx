import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6" aria-busy="true">
      <Skeleton className="h-12 w-56" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px]" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
