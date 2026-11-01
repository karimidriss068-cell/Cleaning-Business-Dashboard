"use client";

import { CheckCircle2 } from "lucide-react";
import { retryGhlSync } from "@/app/actions/ghl";
import { formatNyDateTime } from "@/lib/format";
import type { SyncStatus } from "@/lib/schemas/ghl";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { EmptyState } from "@/components/system/empty-state";
import { useFinanceAction } from "@/components/invoices/use-finance-action";

const KIND_LABELS = { queue: "Sync to GHL", webhook: "Webhook from GHL", message: "Automated text" } as const;

/** Everything that failed to sync, newest first. Queue items can be retried; the reconciliation re-reads missed webhooks by itself. */
export function FailedPanel({ failed }: { failed: SyncStatus["failed"] }) {
  const { run, pending } = useFinanceAction();
  return (
    <GlassPanel as="section" aria-labelledby="ghl-failed" className="kc-enter p-5" data-testid="ghl-failed">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ghl-failed" className="font-heading text-lg font-medium text-ink">Failed syncs</h2>
        <StatusPill tone={failed.length === 0 ? "success" : "danger"}>{failed.length === 0 ? "None" : `${failed.length} failed`}</StatusPill>
      </div>
      {failed.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing has failed">Failed syncs and texts are retried with a growing delay, then listed here.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {failed.map((f) => (
            <li key={`${f.kind}-${f.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
              <div className="min-w-0">
                <p className="text-ink">{KIND_LABELS[f.kind]} <span className="text-ink-muted">· {f.what} · {formatNyDateTime(f.at)}{f.kind === "queue" ? ` · ${f.attempts} tries` : ""}</span></p>
                {f.error && <p className="break-words text-ink-muted">{f.error}</p>}
              </div>
              {f.kind === "queue" && (
                <Button type="button" variant="secondary" disabled={pending} className="h-11 md:h-8" onClick={() => run(() => retryGhlSync({ id: f.id }), "Queued to try again")}>
                  Retry
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
