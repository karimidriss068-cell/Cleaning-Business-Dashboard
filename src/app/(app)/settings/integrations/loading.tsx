import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6" aria-busy="true">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-56" />
      <Skeleton className="h-32" />
      <Skeleton className="h-96" />
    </div>
  );
}
