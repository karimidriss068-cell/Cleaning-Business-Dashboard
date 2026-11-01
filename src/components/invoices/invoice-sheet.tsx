import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { balanceCents, depositDueCents, invoiceNumberLabel, ppmToPercent } from "@/lib/invoices";
import { invoiceDisplayStatus, invoiceStatusLabel, invoiceTone, type InvoiceStatus } from "@/lib/status";
import { StatusPill } from "@/components/system/status-pill";

export type SheetData = {
  number: number;
  status: InvoiceStatus;
  customer: string;
  issuedOn: string | null;
  dueOn: string | null;
  lines: { description: string; quantity: number; unitPriceCents: number; taxable: boolean }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  taxRatePpm: number;
  totalCents: number;
  depositCents: number;
  paidCents: number;
  notes: string | null;
};

/**
 * The invoice as a document: used on the printable page (paper look), the
 * customer's pay page and the detail screen. Presentational only; amounts are
 * the stored integer cents.
 */
export function InvoiceSheet({ data, today, paper = false, className }: { data: SheetData; today: string; paper?: boolean; className?: string }) {
  const status = invoiceDisplayStatus(data.status, data.dueOn, today);
  const balance = balanceCents(data.totalCents, data.paidCents);
  const depositDue = depositDueCents(data.depositCents, data.paidCents, data.totalCents);
  const showTax = data.taxCents > 0;
  return (
    <article className={cn("space-y-6", paper && "kc-paper p-8", className)} aria-label={`Invoice ${invoiceNumberLabel(data.number)}`} data-testid="invoice-sheet">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-muted uppercase">{brand.name}</p>
          <h2 className="mt-1 font-heading text-3xl font-semibold text-ink">Invoice {invoiceNumberLabel(data.number)}</h2>
        </div>
        {paper ? (
          <span className="rounded-sm border border-ink px-2.5 py-0.5 text-xs font-semibold tracking-[0.12em] text-ink uppercase">{invoiceStatusLabel[status]}</span>
        ) : (
          <StatusPill tone={invoiceTone(data.status, data.dueOn, today)}>{invoiceStatusLabel[status]}</StatusPill>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Billed to</dt>
          <dd className="font-medium text-ink">{data.customer}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Issued</dt>
          <dd className="text-ink tabular">{data.issuedOn ? formatCalendarDate(data.issuedOn) : "Not sent yet"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Due</dt>
          <dd className="text-ink tabular">{data.dueOn ? formatCalendarDate(data.dueOn) : "—"}</dd>
        </div>
      </dl>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[12px] tracking-wide text-ink-muted uppercase">
            <th className="py-2 font-medium">Description</th>
            <th className="w-12 py-2 text-right font-medium">Qty</th>
            <th className="w-24 py-2 text-right font-medium">Price</th>
            <th className="w-28 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i} className="border-b border-hairline align-top">
              <td className="py-2.5 pr-3 text-ink">
                {l.description}
                {l.taxable && showTax && <span className="ml-2 text-[11px] text-ink-muted">taxable</span>}
              </td>
              <td className="py-2.5 text-right tabular">{l.quantity}</td>
              <td className="py-2.5 text-right tabular">{formatCents(l.unitPriceCents)}</td>
              <td className="py-2.5 text-right font-medium text-ink tabular">{formatCents(l.quantity * l.unitPriceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular">{formatCents(data.subtotalCents)}</dd></div>
        {data.discountCents > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Discount</dt><dd className="tabular">−{formatCents(data.discountCents)}</dd></div>}
        {showTax && <div className="flex justify-between"><dt className="text-ink-muted">Sales tax ({ppmToPercent(data.taxRatePpm)}%)</dt><dd className="tabular">{formatCents(data.taxCents)}</dd></div>}
        <div className="flex justify-between border-t border-hairline pt-2 text-base font-semibold text-ink"><dt>Total</dt><dd className="tabular">{formatCents(data.totalCents)}</dd></div>
        {data.depositCents > 0 && (
          <div className="flex justify-between"><dt className="text-ink-muted">Deposit{depositDue === 0 ? " (paid)" : ""}</dt><dd className="tabular">{formatCents(data.depositCents)}</dd></div>
        )}
        {data.paidCents > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Paid</dt><dd className="tabular">−{formatCents(data.paidCents)}</dd></div>}
        <div className="flex justify-between border-t border-hairline pt-2 text-lg font-semibold text-ink"><dt>Balance due</dt><dd className="tabular" data-testid="sheet-balance">{formatCents(balance)}</dd></div>
      </dl>

      {data.notes && <p className="rounded-sm border border-hairline p-3 text-sm whitespace-pre-line text-ink">{data.notes}</p>}
    </article>
  );
}
