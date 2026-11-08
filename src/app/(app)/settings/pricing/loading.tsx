import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 md:px-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
