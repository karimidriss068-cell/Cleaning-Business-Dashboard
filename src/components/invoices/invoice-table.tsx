"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { balanceCents, invoiceNumberLabel } from "@/lib/invoices";
import { invoiceDisplayStatus, invoiceLabel, invoiceStatusLabel, invoiceTone, type InvoiceStatus } from "@/lib/status";
import type { InvoiceRow } from "@/lib/finance-data";
import { DataTable } from "@/components/system/data-table";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt } from "lucide-react";

const FILTERS: ("all" | InvoiceStatus)[] = ["all", "draft", "sent", "partially_paid", "overdue", "paid", "void"];

/** Invoices with status filters and search. Overdue is derived from the NY due date, so it is right before the nightly job runs. */
export function InvoiceTable({ rows, today }: { rows: InvoiceRow[]; today: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && invoiceDisplayStatus(r.status, r.dueOn, today) !== filter) return false;
      if (!q) return true;
      return r.customer.toLowerCase().includes(q) || invoiceNumberLabel(r.number).toLowerCase().includes(q) || String(r.number) === q.replace(/^inv-?0*/, "");
    });
  }, [rows, filter, query, today]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      const s = invoiceDisplayStatus(r.status, r.dueOn, today);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows, today]);

  return (
    <DataTable
      title="All invoices"
      description={`${shown.length} of ${rows.length}`}
      storageKey="kc:density:invoices"
      actions={
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer or number" aria-label="Search invoices" className="h-9 w-56 pl-8 max-sm:w-40" />
        </div>
      }
    >
      <div role="radiogroup" aria-label="Filter by status" className="flex gap-1.5 overflow-x-auto border-b border-hairline px-5 py-3">
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-fast",
                on ? "border-brand/50 bg-info-soft text-brand-text" : "border-hairline text-ink-muted hover:text-ink",
              )}
            >
              {f === "all" ? "All" : invoiceStatusLabel[f]}
              <span className="text-[12px] tabular opacity-80">{counts[f] ?? 0}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Receipt} title={rows.length === 0 ? "No invoices yet" : "Nothing matches"}>
          {rows.length === 0 ? "Create one from a completed visit above." : "Try another status or search."}
        </EmptyState>
      ) : (
        <Table containerClassName="max-h-[640px]" stackOnMobile>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => {
              const balance = r.status === "draft" || r.status === "void" ? 0 : balanceCents(r.totalCents, r.paidCents);
              return (
                <TableRow key={r.id} data-testid="invoice-row">
                  <TableCell label="Invoice" className="font-medium tabular">
                    <Link href={`/invoices/${r.id}`} className="text-brand-text underline-offset-4 hover:underline">{invoiceNumberLabel(r.number)}</Link>
                  </TableCell>
                  <TableCell label="Customer" className="max-w-[240px] truncate max-md:max-w-none">{r.customer}</TableCell>
                  <TableCell label="Due" className="tabular">{r.dueOn ? formatCalendarDate(r.dueOn) : "—"}</TableCell>
                  <TableCell label="Total" className="text-right tabular">{formatCents(r.totalCents)}</TableCell>
                  <TableCell label="Balance" className="text-right font-medium tabular">{formatCents(balance)}</TableCell>
                  <TableCell label="Status">
                    <StatusPill tone={invoiceTone(r.status, r.dueOn, today)}>{invoiceLabel(r.status, r.dueOn, today)}</StatusPill>
                    {r.collected && r.status !== "paid" && <span className="ml-2 text-[12px] text-ink-muted">collected</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </DataTable>
  );
}
