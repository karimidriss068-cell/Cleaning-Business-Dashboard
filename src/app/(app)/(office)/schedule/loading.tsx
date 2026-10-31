export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 md:px-6" aria-busy="true" aria-label="Loading schedule">
      <div className="h-10 w-48 kc-shimmer rounded-sm" />
      <div className="h-10 w-72 kc-shimmer rounded-sm" />
      <div className="h-[560px] kc-shimmer rounded-md border border-hairline" />
    </div>
  );
}
