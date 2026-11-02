import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-6 md:px-6">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-[34rem] w-full" />
    </div>
  );
}
