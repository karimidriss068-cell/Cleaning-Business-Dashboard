"use client";

import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTransition } from "react";
import { createInvoiceFromJob, createInvoiceFromQuote } from "@/app/actions/invoices";
import { formatCalendarDate, formatCents } from "@/lib/format";
import type { ReadyQuote, ReadyVisit } from "@/lib/finance-data";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/system/glass-panel";

/** Completed visits and accepted quotes with no invoice yet: one click starts a draft. */
export function ReadyToInvoice({ visits, quotes, canCreate }: { visits: ReadyVisit[]; quotes: ReadyQuote[]; canCreate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (visits.length === 0 && quotes.length === 0) return null;

  function create(kind: "job" | "quote", id: string) {
    start(async () => {
      const res = kind === "job" ? await createInvoiceFromJob({ jobId: id }) : await createInvoiceFromQuote({ quoteId: id });
      if (res.ok) {
        toast.success("Draft invoice created");
        router.push(`/invoices/${res.invoiceId}`);
        return;
      }
      toast.error(res.message);
      if (res.code === "duplicate") router.refresh();
    });
  }

  return (
    <GlassPanel as="section" aria-labelledby="ready-heading" className="p-5">
      <h2 id="ready-heading" className="font-heading text-lg font-medium text-ink">Ready to invoice</h2>
      <p className="text-[13px] text-ink-muted">Completed visits and accepted quotes that haven&apos;t been billed.</p>
      <ul className="mt-3 divide-y divide-hairline">
        {visits.map((v) => (
          <li key={v.jobId} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="ready-visit">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{v.customer}</p>
              <p className="text-[13px] text-ink-muted tabular">{v.service} · {v.completedOn ? formatCalendarDate(v.completedOn) : ""} · {formatCents(v.priceCents)}</p>
            </div>
            {canCreate && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => create("job", v.jobId)} className="h-9">
                <FilePlus2 aria-hidden /> Create invoice
              </Button>
            )}
          </li>
        ))}
        {quotes.map((q) => (
          <li key={q.quoteId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{q.customer}</p>
              <p className="text-[13px] text-ink-muted tabular">Quote #{q.number} · accepted · {formatCents(q.totalCents)}</p>
            </div>
            {canCreate && (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => create("quote", q.quoteId)} className="h-9">
                <FilePlus2 aria-hidden /> Invoice from quote
              </Button>
            )}
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
