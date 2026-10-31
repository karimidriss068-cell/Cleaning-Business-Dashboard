export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading your visits">
      <div className="h-10 w-3/4 kc-shimmer rounded-sm" />
      <div className="h-64 kc-shimmer rounded-lg border border-hairline" />
      <div className="h-64 kc-shimmer rounded-lg border border-hairline" />
    </div>
  );
}
