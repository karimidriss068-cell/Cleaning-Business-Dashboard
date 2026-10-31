// Skeleton while the pipeline loads (the sheen stops under reduced motion).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 md:px-6" aria-busy="true" aria-label="Loading leads">
      <div className="kc-shimmer h-9 w-64 rounded-sm" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="kc-shimmer h-[360px] rounded-md border border-hairline" />
        ))}
      </div>
    </div>
  );
}
