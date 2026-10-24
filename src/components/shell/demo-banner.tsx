import { TriangleAlert } from "lucide-react";

/** Shown whenever seed rows exist (DESIGN.md section 9). Not dismissible. */
export function DemoBanner() {
  return (
    <div role="status" className="flex items-start gap-2.5 border-b border-warning-fill/40 bg-warning-soft px-4 py-2.5 text-sm text-warning md:items-center md:px-6">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 md:mt-0" aria-hidden />
      <p>
        <strong className="font-semibold">Demo data loaded, purge before launch.</strong>{" "}
        <span className="text-ink-muted sm:hidden">Run the seed purge before real customers go in.</span>
        <span className="hidden text-ink-muted sm:inline">
          Run <code className="font-mono text-[13px] whitespace-nowrap text-ink">node scripts/seed.mts --project-ref … --purge</code> before real customers go in.
        </span>
      </p>
    </div>
  );
}
