import { HeaderSkeleton, HeroSkeleton, TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-10 p-6 sm:space-y-12 sm:p-8">
        <HeroSkeleton />
        <TableSkeleton />
      </div>
    </>
  );
}
