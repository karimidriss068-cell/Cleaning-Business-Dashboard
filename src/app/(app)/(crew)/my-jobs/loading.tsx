export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-6" aria-busy="true" aria-label="Loading your visits">
      <div className="h-10 w-3/4 animate-pulse rounded-sm bg-surface-raised" />
      <div className="h-64 animate-pulse rounded-lg border border-hairline bg-surface" />
      <div className="h-64 animate-pulse rounded-lg border border-hairline bg-surface" />
    </div>
  );
}
