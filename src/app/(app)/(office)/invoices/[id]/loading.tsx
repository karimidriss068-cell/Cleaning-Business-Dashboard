import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6" aria-busy="true">
      <Skeleton className="h-12 w-56" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-[520px] lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
