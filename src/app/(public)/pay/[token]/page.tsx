import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { nyToday } from "@/lib/format";
import { balanceCents, depositDueCents } from "@/lib/invoices";
import { payTokenSchema } from "@/lib/schemas/finance";
import { GlassPanel } from "@/components/system/glass-panel";
import { InvoiceSheet } from "@/components/invoices/invoice-sheet";
import { PayPanel } from "@/components/invoices/pay-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pay your invoice", robots: { index: false, follow: false } };

const invoiceSchema = z.object({
  invoice_number: z.number().int(),
  status: z.enum(["sent", "partially_paid", "paid", "overdue", "void", "uncollectible", "draft"]),
  customer: z.string().nullable(),
  issued_on: z.string().nullable(),
  due_on: z.string().nullable(),
  notes: z.string().nullable(),
  subtotal_cents: z.number().int(),
  discount_cents: z.number().int(),
  tax_cents: z.number().int(),
  tax_rate_ppm: z.number().int(),
  total_cents: z.number().int(),
  deposit_cents: z.number().int(),
  amount_paid_cents: z.number().int(),
  lines: z.array(z.object({ description: z.string(), quantity: z.number().int(), unit_price_cents: z.number().int(), taxable: z.boolean() })),
});

/** The customer's invoice and pay button. Reached only by the unguessable link; shows no contact details. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  if (!payTokenSchema.safeParse(token).success) notFound();
  const { data, error } = await createAdminClient().rpc("invoice_for_pay_token", { p_token: token });
  const parsed = invoiceSchema.safeParse(data);
  if (error || !parsed.success) notFound();
  const inv = parsed.data;
  const sp = await searchParams;
  const today = nyToday();
  const balance = balanceCents(inv.total_cents, inv.amount_paid_cents);
  const depositDue = depositDueCents(inv.deposit_cents, inv.amount_paid_cents, inv.total_cents);
  const payable = inv.status === "sent" || inv.status === "partially_paid" || inv.status === "overdue";

  return (
    <div className="space-y-6">
      {sp.paid === "1" && (
        <GlassPanel level="popover" role="status" className="flex items-start gap-3 p-4 text-sm text-ink">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <span>Thank you. Your payment is being confirmed and will show on this invoice in a moment.</span>
        </GlassPanel>
      )}
      <GlassPanel level="card" className="p-6">
        <InvoiceSheet
          today={today}
          data={{
            number: inv.invoice_number,
            status: inv.status,
            customer: inv.customer ?? "Customer",
            issuedOn: inv.issued_on,
            dueOn: inv.due_on,
            lines: inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unit_price_cents, taxable: l.taxable })),
            subtotalCents: inv.subtotal_cents,
            discountCents: inv.discount_cents,
            taxCents: inv.tax_cents,
            taxRatePpm: inv.tax_rate_ppm,
            totalCents: inv.total_cents,
            depositCents: inv.deposit_cents,
            paidCents: inv.amount_paid_cents,
            notes: inv.notes,
          }}
        />
      </GlassPanel>

      {payable && balance > 0 && <PayPanel token={token} depositDueCents={depositDue} balanceCents={balance} />}
      {inv.status === "paid" && (
        <GlassPanel level="popover" className="flex items-start gap-3 p-4 text-sm text-ink">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> This invoice is paid. Thank you!
        </GlassPanel>
      )}
      {inv.status === "void" && (
        <GlassPanel level="popover" className="flex items-start gap-3 p-4 text-sm text-ink">
          <Info className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden /> This invoice was cancelled and doesn&apos;t need to be paid.
        </GlassPanel>
      )}
      <p className="text-center text-[12px] text-ink-muted">Payments are in Stripe test mode for now.</p>
    </div>
  );
}
