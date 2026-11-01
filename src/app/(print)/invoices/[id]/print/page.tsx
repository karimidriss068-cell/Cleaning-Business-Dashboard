import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { financeContext } from "@/lib/finance-auth";
import { loadInvoiceDetail } from "@/lib/finance-data";
import { nyToday } from "@/lib/format";
import { invoiceNumberLabel } from "@/lib/invoices";
import { InvoiceSheet } from "@/components/invoices/invoice-sheet";
import { PrintButton } from "@/components/invoices/print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

/** A clean, printable invoice. Use the browser's Print, then "Save as PDF" for a file. */
export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.role || ctx.role === "subcontractor") notFound();
  const invoice = await loadInvoiceDetail(ctx.supabase, id);
  if (!invoice || invoice.status === "draft") notFound();
  return (
    <div className="space-y-4">
      <div className="kc-print-hide flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">{invoiceNumberLabel(invoice.number)} · print preview</p>
        <PrintButton />
      </div>
      <InvoiceSheet paper data={invoice} today={nyToday()} />
    </div>
  );
}
