// Skeleton while the Command Center loads (pulse is off under reduced motion).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6" aria-busy="true" aria-label="Loading Command Center">
      <div className="h-8 w-56 kc-shimmer rounded-sm" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[124px] kc-shimmer rounded-md border border-hairline" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-96 kc-shimmer rounded-md border border-hairline lg:col-span-2" />
        <div className="h-96 kc-shimmer rounded-lg border border-hairline" />
      </div>
    </div>
  );
}
