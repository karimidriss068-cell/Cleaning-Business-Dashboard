export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 md:px-6" aria-busy="true" aria-label="Loading schedule">
      <div className="h-10 w-48 animate-pulse rounded-sm bg-surface-raised" />
      <div className="h-10 w-72 animate-pulse rounded-sm bg-surface-raised" />
      <div className="h-[560px] animate-pulse rounded-md border border-hairline bg-surface" />
    </div>
  );
}
