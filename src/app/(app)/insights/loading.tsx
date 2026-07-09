import { HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <HeaderSkeleton />
      <div className="p-6">
        <div className="mx-auto max-w-2xl">
          <div className="skeleton mb-3 h-4 w-56" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
