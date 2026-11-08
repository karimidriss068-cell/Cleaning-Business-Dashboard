import { brand } from "@/config/brand";
import { BID_TERMS } from "@/config/business";
import { cn } from "@/lib/utils";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { bidNumberLabel } from "@/lib/bids";
import { spaceTypeLabel } from "@/lib/schemas/pricing";
import type { BidDetail, BidVersionRow } from "@/lib/bids-data";

/**
 * The bid as the customer reads it: scope and price only. Cost, margin and the pricing rules never
 * appear here. Presentational; amounts are the stored integer cents of the version shown.
 */
export function BidSheet({ bid, version, paper = false, className }: { bid: BidDetail; version: BidVersionRow; paper?: boolean; className?: string }) {
  const { inputs } = version;
  const sent = bid.sentAt ? bid.sentAt.slice(0, 10) : null;
  return (
    <article className={cn("space-y-6", paper && "kc-paper p-8", className)} aria-label={`${bidNumberLabel(bid.number)}, version ${version.version}`} data-testid="bid-sheet">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-muted uppercase">{brand.name}</p>
          <h2 className="mt-1 font-heading text-3xl font-semibold text-ink">{bid.title}</h2>
          <p className="text-sm text-ink-muted">{bidNumberLabel(bid.number)} · version {version.version}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-muted">Prepared for</dt><dd className="font-medium text-ink">{bid.accountName}</dd><dd className="text-ink-muted">{bid.contact.name}</dd></div>
        <div><dt className="text-ink-muted">Site</dt><dd className="text-ink">{bid.contact.address ?? "To be confirmed"}</dd></div>
        <div>
          <dt className="text-ink-muted">{sent ? "Sent" : "Prepared"}</dt>
          <dd className="text-ink tabular">{formatCalendarDate(sent ?? version.createdAt.slice(0, 10))}</dd>
          {bid.validUntil && <dd className="text-ink-muted">Valid until {formatCalendarDate(bid.validUntil)}</dd>}
        </div>
      </dl>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-[12px] tracking-wide text-ink-muted uppercase">
            <th className="py-2 font-medium">Area</th>
            <th className="py-2 font-medium">Kind of space</th>
            <th className="py-2 text-right font-medium">Square feet</th>
          </tr>
        </thead>
        <tbody>
          {inputs.areas.map((a, i) => (
            <tr key={i} className="border-b border-hairline align-top">
              <td className="py-2 text-ink">{a.label}</td>
              <td className="py-2 text-ink-muted">{spaceTypeLabel[a.spaceType]}</td>
              <td className="py-2 text-right text-ink tabular">{a.sqft.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-ink">
        {inputs.cleans === 1 ? "One clean" : `${inputs.cleans} cleans`}
        {inputs.rush ? ", rush scheduling" : ""}.
      </p>
      {inputs.scopeNotes && <p className="text-sm whitespace-pre-line text-ink">{inputs.scopeNotes}</p>}

      <div className="flex items-baseline justify-between gap-4 border-t border-ink pt-3">
        <span className="font-heading text-lg font-medium text-ink">Total</span>
        <span className="font-heading text-3xl font-semibold text-ink tabular" data-testid="bid-sheet-total">{formatCents(version.priceCents)}</span>
      </div>

      <section aria-label="Terms" className="space-y-1 text-[13px] text-ink-muted">
        <h3 className="font-medium text-ink">Terms</h3>
        <ul className="list-disc space-y-0.5 pl-5">{BID_TERMS.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>
    </article>
  );
}
