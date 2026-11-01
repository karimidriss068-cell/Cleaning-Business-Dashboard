import Link from "next/link";
import { CircleSlash } from "lucide-react";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { reasonLabel } from "@/lib/payouts";
import type { CandidateView } from "@/lib/finance-data";
import { GlassPanel } from "@/components/system/glass-panel";

/**
 * Completed visits that can't be paid out yet, with the reason. This is the
 * "never pay out money I haven't collected" rule made visible: a visit joins a
 * payout only once its invoice is paid or marked collected.
 */
export function ExcludedVisits({ rows }: { rows: CandidateView[] }) {
  return (
    <GlassPanel as="section" aria-labelledby="excluded" className="space-y-3 p-5">
      <div>
        <h2 id="excluded" className="font-heading text-lg font-medium text-ink">Not payable yet</h2>
        <p className="text-[13px] text-ink-muted">Completed visits left out of this week&apos;s payouts, and why. They join a payout as soon as the reason clears.</p>
      </div>
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted"><CircleSlash className="size-4" aria-hidden /> Every completed visit is either on a payout or ready to be.</p>
      ) : (
        <ul className="divide-y divide-hairline" data-testid="excluded-visits">
          {rows.map((r) => (
            <li key={r.assignmentId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5" data-testid="excluded-row" data-reason={r.reason ?? ""}>
              <div className="min-w-0">
                <p className="truncate text-sm text-ink"><span className="font-medium">{r.subcontractor}</span> · {r.service} · {r.client}</p>
                <p className="text-[12px] text-ink-muted tabular">{formatCalendarDate(r.completedOn)} · {r.payCents === null ? "pay not set" : formatCents(r.payCents)}</p>
              </div>
              <p className="text-[13px] text-warning">
                {r.invoiceId ? (
                  <Link href={`/invoices/${r.invoiceId}`} className="underline underline-offset-2">{reasonLabel(r.reason ?? "", { invoiceNumber: r.invoiceNumber, balanceCents: r.invoiceBalanceCents })}</Link>
                ) : (
                  reasonLabel(r.reason ?? "", { invoiceNumber: r.invoiceNumber, balanceCents: r.invoiceBalanceCents })
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
