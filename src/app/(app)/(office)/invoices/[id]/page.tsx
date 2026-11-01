import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { loadInvoiceDetail, loadSettings } from "@/lib/finance-data";
import { formatNyDate, formatNyTime, nyToday } from "@/lib/format";
import { invoiceNumberLabel } from "@/lib/invoices";
import { PageHeader } from "@/components/shell/page-header";
import { GlassPanel } from "@/components/system/glass-panel";
import { InvoiceSheet } from "@/components/invoices/invoice-sheet";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { InvoicePanel } from "@/components/invoices/invoice-actions";

export const metadata: Metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  created: "Draft created",
  edited: "Draft edited",
  sent: "Invoice sent",
  voided: "Invoice voided",
  draft_deleted: "Draft deleted",
  recorded: "Payment recorded",
  stripe_payment: "Card payment received",
  stripe_refund: "Refund recorded (Stripe)",
  marked_collected: "Marked collected",
  collected_cleared: "Collected mark removed",
  marked_overdue: "Marked overdue",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.role) redirect("/invoices");
  if (ctx.role === "subcontractor") redirect("/my-jobs");

  const [invoice, settings] = await Promise.all([loadInvoiceDetail(ctx.supabase, id), loadSettings(ctx.supabase)]);
  if (!invoice) notFound();
  const today = nyToday();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const origin = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
  const editing = invoice.status === "draft" && ctx.isAdmin;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow={
          <Link href="/invoices" className="inline-flex items-center gap-1.5 hover:underline">
            <ArrowLeft className="size-3.5" aria-hidden /> Invoices
          </Link>
        }
        title={invoiceNumberLabel(invoice.number)}
        description={`${invoice.customer}${invoice.quoteNumber ? ` · from quote #${invoice.quoteNumber}` : ""}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {editing ? (
            <InvoiceEditor
              invoiceId={invoice.id}
              updatedAt={invoice.updatedAt}
              lines={invoice.lines}
              discountCents={invoice.discountCents}
              depositCents={invoice.depositCents}
              dueOn={invoice.dueOn}
              notes={invoice.notes}
              taxRatePpm={invoice.taxRatePpm}
              defaultLineTaxable={settings.defaultLineTaxable}
              dueDays={settings.invoiceDueDays}
              today={today}
            />
          ) : (
            <GlassPanel className="p-6">
              <InvoiceSheet data={{ ...invoice, lines: invoice.lines }} today={today} />
            </GlassPanel>
          )}

          <GlassPanel as="section" aria-labelledby="activity" className="p-5">
            <h2 id="activity" className="font-heading text-lg font-medium text-ink">Activity</h2>
            {invoice.log.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
            ) : (
              <ol className="mt-3 space-y-2.5" data-testid="activity-log">
                {invoice.log.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink">{ACTION_LABELS[l.action] ?? l.action.replace(/_/g, " ")}</span>
                    <span className="shrink-0 text-[12px] text-ink-muted tabular">{formatNyDate(l.at)} · {formatNyTime(l.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </GlassPanel>
        </div>

        <InvoicePanel invoice={invoice} isAdmin={ctx.isAdmin} today={today} origin={origin} />
      </div>
    </div>
  );
}
