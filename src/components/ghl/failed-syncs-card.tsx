import Link from "next/link";
import { ArrowRight, CheckCircle2, CloudOff } from "lucide-react";
import { formatNyDateTime } from "@/lib/format";
import type { SyncStatus } from "@/lib/schemas/ghl";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";

const KIND = { queue: "Sync to GHL", webhook: "Webhook from GHL", message: "Automated text" } as const;

/** Command Center: failed GoHighLevel syncs (owner/admin). Quiet when there are none. */
export function FailedSyncsCard({ status }: { status: SyncStatus }) {
  const none = status.failedCount === 0;
  return (
    <GlassPanel as="section" aria-labelledby="ghl-failed-card" level="flat" className="kc-enter p-4" data-testid="ghl-failed-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ghl-failed-card" className="flex items-center gap-2 font-heading text-base font-medium text-ink">
          {none ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <CloudOff className="size-4 text-danger" aria-hidden />}
          GoHighLevel sync
        </h2>
        <StatusPill tone={none ? "success" : "danger"}>{none ? "All synced" : `${status.failedCount} failed`}</StatusPill>
      </div>
      {!none && (
        <ul className="mt-2 space-y-1 text-[13px]">
          {status.failed.slice(0, 3).map((f) => (
            <li key={`${f.kind}-${f.id}`} className="text-ink-muted"><span className="text-ink">{KIND[f.kind]}</span> · {f.what} · {formatNyDateTime(f.at)}{f.error ? ` · ${f.error}` : ""}</li>
          ))}
        </ul>
      )}
      <Link href="/settings/integrations" className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        Sync status <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </GlassPanel>
  );
}
