import {
  HeaderSkeleton,
  HeroSkeleton,
  StatGridSkeleton,
  ChartSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="space-y-10 p-6 sm:space-y-14 sm:p-10">
        <HeroSkeleton />
        <StatGridSkeleton count={4} />
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    </>
  );
}
