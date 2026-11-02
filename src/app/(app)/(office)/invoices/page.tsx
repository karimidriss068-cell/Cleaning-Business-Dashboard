import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { loadFinanceMonths, loadInvoiceList, loadReadyToInvoice } from "@/lib/finance-data";
import { formatNyDate, nyToday } from "@/lib/format";
import { balanceCents } from "@/lib/invoices";
import { invoiceDisplayStatus } from "@/lib/status";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/system/stat-tile";
import { EmptyState } from "@/components/system/empty-state";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { ReadyToInvoice } from "@/components/invoices/ready-to-invoice";
import { AnalyticsSection } from "@/components/analytics/analytics-section";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (!ctx.role) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">
        <div className="rounded-md border glass-card">
          <EmptyState icon={UserX} title="Your login isn't on the team yet">Ask the owner to add you.</EmptyState>
        </div>
      </div>
    );
  }
  if (ctx.role === "subcontractor") redirect("/my-jobs");

  const now = new Date();
  const today = nyToday(now);
  const [rows, ready, months] = await Promise.all([loadInvoiceList(ctx.supabase), loadReadyToInvoice(ctx.supabase, today), loadFinanceMonths(ctx.supabase, 1)]);

  const live = rows.filter((r) => r.status !== "draft" && r.status !== "void");
  const owing = live.filter((r) => r.status !== "paid");
  const outstanding = owing.reduce((s, r) => s + balanceCents(r.totalCents, r.paidCents), 0);
  const overdue = owing.filter((r) => invoiceDisplayStatus(r.status, r.dueOn, today) === "overdue");
  const overdueCents = overdue.reduce((s, r) => s + balanceCents(r.totalCents, r.paidCents), 0);
  const drafts = rows.filter((r) => r.status === "draft");
  const month = months.at(-1);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow={`Business · ${formatNyDate(now, "weekday")}`}
        title="Invoices"
        description={ctx.isAdmin ? "Bill completed visits, take payments, and see what's still owed." : "Invoices are read-only for staff. The owner or an admin creates and edits them."}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Outstanding" figure={{ value: outstanding, kind: "cents", hideZeroCents: true }} hint={`${owing.length} unpaid invoice${owing.length === 1 ? "" : "s"}`} index={1} />
        <StatTile
          label="Overdue"
          figure={{ value: overdueCents, kind: "cents", hideZeroCents: true }}
          hint={`${overdue.length} past due`}
          delta={overdue.length ? { label: `${overdue.length} to chase`, direction: "up", good: false } : undefined}
          index={2}
        />
        <StatTile label="Collected this month" figure={{ value: month?.collectedCents ?? 0, kind: "cents", hideZeroCents: true }} hint="payments minus refunds" index={3} />
        <StatTile label="Drafts" figure={{ value: drafts.length, kind: "count" }} hint="not sent yet" index={4} />
      </div>

      <ReadyToInvoice visits={ready.visits} quotes={ready.quotes} canCreate={ctx.isAdmin} />

      <div className="kc-enter" style={{ "--i": 6 } as React.CSSProperties}>
        <InvoiceTable rows={rows} today={today} />
      </div>
      <AnalyticsSection pack="invoices" />
    </div>
  );
}
