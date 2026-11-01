"use client";

import { useState } from "react";
import { BadgeCheck, Ban, CircleDollarSign, Copy, CreditCard, ExternalLink, Link2, Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  chargeCardOnFile,
  clearInvoiceCollected,
  createCardLink,
  markInvoiceCollected,
  recordPayment,
  recordRefund,
  removeCardOnFile,
  voidInvoice,
} from "@/app/actions/invoices";
import { formatCalendarDate, formatCents, formatNyDate, parseDollarsToCents } from "@/lib/format";
import { balanceCents, depositDueCents, invoiceNumberLabel } from "@/lib/invoices";
import { invoiceDisplayStatus, invoiceLabel, invoiceTone, type InvoiceStatus } from "@/lib/status";
import { PAYMENT_METHODS, markCollectedSchema, methodLabel, recordPaymentSchema, recordRefundSchema, voidInvoiceSchema } from "@/lib/schemas/finance";
import type { InvoiceDetail } from "@/lib/finance-data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "./use-finance-action";

const methodItems = PAYMENT_METHODS.map((m) => ({ value: m, label: methodLabel[m] }));
const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="text-[12px] text-danger">{message}</p> : null;
}

function DialogFrame({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-lg border-hairline bg-transparent px-6 py-4">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Record a payment ---------------------------------------------------------------

// Each dialog remounts when it opens (key), so its fields start fresh without an effect.
function PaymentDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; invoice: InvoiceDetail; today: string }) {
  return <PaymentDialogInner key={props.open ? "open" : "closed"} {...props} />;
}

function PaymentDialogInner({ open, onOpenChange, invoice, today }: { open: boolean; onOpenChange: (o: boolean) => void; invoice: InvoiceDetail; today: string }) {
  const { run, pending } = useFinanceAction();
  const balance = balanceCents(invoice.totalCents, invoice.paidCents);
  const depositDue = depositDueCents(invoice.depositCents, invoice.paidCents, invoice.totalCents);
  const [amount, setAmount] = useState(() => dollars(depositDue > 0 ? depositDue : balance));
  const [method, setMethod] = useState<string>("zelle");
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [requestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (cents === null) return setErrors({ amountCents: "Enter dollars, like 120 or 120.50" });
    const input = { invoiceId: invoice.id, amountCents: cents, method, reference, receivedOn, requestId };
    const parsed = recordPaymentSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (cents > balance) return setErrors({ amountCents: `That is more than the ${formatCents(balance)} balance` });
    setErrors({});
    run(() => recordPayment(input), `${formatCents(cents)} recorded`, () => onOpenChange(false), setServerError);
  }

  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Record a payment"
      description={`${invoiceNumberLabel(invoice.number)} · ${formatCents(balance)} due. For cash, Zelle or check; cards are paid through the link.`}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">Cancel</Button>
          <Button type="submit" form="payment-form" disabled={pending} className="h-11 sm:h-9">{pending ? "Recording…" : "Record payment"}</Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Amount ($)</Label>
          <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.amountCents)} aria-describedby="pay-amount-err" className="h-11 md:h-9" autoFocus />
          <FieldError id="pay-amount-err" message={errors.amountCents} />
          <div className="flex gap-2 text-[12px]">
            {depositDue > 0 && depositDue < balance && (
              <button type="button" className="text-brand-text underline underline-offset-2" onClick={() => setAmount(dollars(depositDue))}>Deposit {formatCents(depositDue)}</button>
            )}
            <button type="button" className="text-brand-text underline underline-offset-2" onClick={() => setAmount(dollars(balance))}>Full balance {formatCents(balance)}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select items={methodItems} value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger className="h-11 w-full md:h-9" aria-label="Method"><SelectValue /></SelectTrigger>
              <SelectContent>{methodItems.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Received on</Label>
            <Input id="pay-date" type="date" value={receivedOn} max={today} onChange={(e) => setReceivedOn(e.target.value)} className="h-11 md:h-9" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-ref">{method === "check" ? "Check number" : method === "zelle" ? "Zelle confirmation" : "Reference (optional)"}</Label>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={Boolean(errors.reference)} aria-describedby="pay-ref-err" autoComplete="off" className="h-11 md:h-9" />
          <FieldError id="pay-ref-err" message={errors.reference} />
        </div>
        {serverError && <p role="alert" className="text-[13px] text-danger">{serverError}</p>}
      </form>
    </DialogFrame>
  );
}

// Mark collected / void / refund -------------------------------------------------------

function ReasonDialog(props: ReasonDialogProps) {
  return <ReasonDialogInner key={props.open ? "open" : "closed"} {...props} />;
}

type ReasonDialogProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirm: string;
  schemaCheck: (text: string) => string | null;
  onSubmit: (text: string, done: () => void, fail: (m: string) => void) => void;
  danger?: boolean;
};

function ReasonDialogInner({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirm,
  schemaCheck,
  onSubmit,
  danger,
}: ReasonDialogProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = schemaCheck(text);
    if (problem) return setError(problem);
    setError(null);
    onSubmit(text, () => onOpenChange(false), setError);
  }
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">Cancel</Button>
          <Button type="submit" form={`reason-${title}`} variant={danger ? "danger" : "default"} className="h-11 sm:h-9">{confirm}</Button>
        </>
      }
    >
      <form id={`reason-${title}`} onSubmit={submit} className="space-y-1.5" noValidate>
        <Label htmlFor={`reason-text-${title}`}>{label}</Label>
        <Textarea id={`reason-text-${title}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-invalid={Boolean(error)} autoFocus />
        <FieldError id={`reason-err-${title}`} message={error ?? undefined} />
      </form>
    </DialogFrame>
  );
}

function RefundDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; payment: InvoiceDetail["payments"][number] | null }) {
  return <RefundDialogInner key={`${props.open ? "open" : "closed"}-${props.payment?.id ?? ""}`} {...props} />;
}

function RefundDialogInner({ open, onOpenChange, payment }: { open: boolean; onOpenChange: (o: boolean) => void; payment: InvoiceDetail["payments"][number] | null }) {
  const { run, pending } = useFinanceAction();
  const remaining = payment ? payment.amountCents - payment.refundedCents : 0;
  const [amount, setAmount] = useState(() => dollars(remaining));
  const [reason, setReason] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!payment) return null;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (cents === null) return setErrors({ amountCents: "Enter dollars, like 25 or 25.50" });
    const input = { paymentId: payment!.id, amountCents: cents, reason, requestId };
    const parsed = recordRefundSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (cents > remaining) return setErrors({ amountCents: `Only ${formatCents(remaining)} can still be refunded` });
    setErrors({});
    run(() => recordRefund(input), `Refund of ${formatCents(cents)} recorded`, () => onOpenChange(false));
  }
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Record a refund"
      description="This only records a refund you've already made (Stripe dashboard, Zelle, check). Nothing is sent from here."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">Cancel</Button>
          <Button type="submit" form="refund-form" disabled={pending} className="h-11 sm:h-9">Record refund</Button>
        </>
      }
    >
      <form id="refund-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="refund-amount">Amount refunded ($)</Label>
          <Input id="refund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.amountCents)} className="h-11 md:h-9" autoFocus />
          <FieldError id="refund-amount-err" message={errors.amountCents} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="refund-reason">Reason (optional)</Label>
          <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 md:h-9" />
        </div>
      </form>
    </DialogFrame>
  );
}

function ChargeDialog({ open, onOpenChange, invoice, card }: { open: boolean; onOpenChange: (o: boolean) => void; invoice: InvoiceDetail; card: InvoiceDetail["cards"][number] }) {
  const { run, pending } = useFinanceAction();
  const balance = balanceCents(invoice.totalCents, invoice.paidCents);
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="Charge the card on file"
      description={`Charge ${formatCents(balance)} to ${card.brand ?? "the card"} ending ${card.last4 ?? "????"}? The payment shows on the invoice once Stripe confirms it.`}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">Cancel</Button>
          <Button
            type="button"
            disabled={pending}
            className="h-11 sm:h-9"
            onClick={() => run(() => chargeCardOnFile({ invoiceId: invoice.id }), (r) => (r.status === "succeeded" ? "Charged. It will appear here in a moment" : `Charge started (${r.status})`), () => onOpenChange(false))}
          >
            {pending ? "Charging…" : `Charge ${formatCents(balance)}`}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted">Test mode only for now: no real money moves.</p>
    </DialogFrame>
  );
}

// The side panel -------------------------------------------------------------------------

export function InvoicePanel({ invoice, isAdmin, today, origin }: { invoice: InvoiceDetail; isAdmin: boolean; today: string; origin: string }) {
  const { run, pending } = useFinanceAction();
  const [dialog, setDialog] = useState<null | "pay" | "collected" | "void" | "charge">(null);
  const [refunding, setRefunding] = useState<InvoiceDetail["payments"][number] | null>(null);
  const status = invoice.status as InvoiceStatus;
  const balance = balanceCents(invoice.totalCents, invoice.paidCents);
  const depositDue = depositDueCents(invoice.depositCents, invoice.paidCents, invoice.totalCents);
  const payable = status === "sent" || status === "partially_paid" || status === "overdue";
  const payLink = `${origin}/pay/${invoice.payToken}`;
  const defaultCard = invoice.cards.find((c) => c.isDefault) ?? invoice.cards[0] ?? null;
  const display = invoiceDisplayStatus(status, invoice.dueOn, today);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  }

  function cardLink() {
    run(() => createCardLink({ contactId: invoice.contactId ?? undefined, accountId: invoice.accountId ?? undefined }), "Card link created", (r) => void copy(r.url, "Card link"));
  }

  return (
    <aside className="space-y-4" aria-label="Invoice actions">
      <GlassPanel className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Balance due</p>
            <p className="font-heading text-[38px] leading-[44px] font-medium text-ink tabular text-glow" data-testid="balance-due">
              <AnimatedNumber value={status === "draft" || status === "void" ? 0 : balance} kind="cents" />
            </p>
            <p className="text-[13px] text-ink-muted tabular">of {formatCents(invoice.totalCents)} · {formatCents(invoice.paidCents)} paid</p>
          </div>
          <StatusPill tone={invoiceTone(status, invoice.dueOn, today)}>{invoiceLabel(status, invoice.dueOn, today)}</StatusPill>
        </div>

        {payable && invoice.depositCents > 0 && depositDue > 0 && (
          <p className="rounded-sm border border-hairline p-2.5 text-[13px] text-ink">Deposit still due: <span className="font-medium tabular">{formatCents(depositDue)}</span></p>
        )}
        {display === "overdue" && invoice.dueOn && <p className="text-[13px] text-danger">Past due since {formatCalendarDate(invoice.dueOn)}.</p>}
        {invoice.collected && (
          <p className="flex items-start gap-2 rounded-sm border border-success/30 bg-success-soft p-2.5 text-[13px] text-success">
            <BadgeCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Marked collected {formatNyDate(invoice.collected.at)}: {invoice.collected.note}</span>
          </p>
        )}
        {status === "void" && <p className="text-[13px] text-ink-muted">Void: {invoice.voidReason}</p>}

        {status !== "draft" && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="h-9" render={<a href={`/invoices/${invoice.id}/print`} target="_blank" rel="noopener noreferrer" />}>
              <Printer aria-hidden /> Print / PDF
            </Button>
          </div>
        )}

        {isAdmin && payable && (
          <div className="space-y-2 border-t border-hairline pt-4">
            <Button className="h-11 w-full sm:h-9" onClick={() => setDialog("pay")} data-testid="record-payment"><CircleDollarSign aria-hidden /> Record payment</Button>
            {defaultCard && (
              <Button variant="secondary" className="h-11 w-full sm:h-9" onClick={() => setDialog("charge")}>
                <CreditCard aria-hidden /> Charge {defaultCard.brand ?? "card"} ••{defaultCard.last4}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {invoice.collected ? (
                <Button variant="secondary" size="sm" className="h-9" disabled={pending} onClick={() => run(() => clearInvoiceCollected({ invoiceId: invoice.id }), "Collected mark removed")}>
                  <Undo2 aria-hidden /> Unmark collected
                </Button>
              ) : (
                <Button variant="secondary" size="sm" className="h-9" onClick={() => setDialog("collected")} data-testid="mark-collected"><BadgeCheck aria-hidden /> Mark collected</Button>
              )}
              {invoice.paidCents === 0 && (
                <Button variant="secondary" size="sm" className="h-9 text-danger" onClick={() => setDialog("void")}><Ban aria-hidden /> Void</Button>
              )}
            </div>
          </div>
        )}
      </GlassPanel>

      {status !== "draft" && status !== "void" && (
        <GlassPanel className="space-y-3 p-5">
          <h2 className="font-heading text-base font-medium text-ink">Customer pay link</h2>
          <div className="flex gap-2">
            <Input readOnly value={payLink} aria-label="Pay link" onFocus={(e) => e.currentTarget.select()} className="h-9 text-[13px]" />
            <Button variant="secondary" size="icon" aria-label="Copy pay link" className="size-9" onClick={() => copy(payLink, "Pay link")}><Copy /></Button>
            <Button variant="secondary" size="icon" aria-label="Open pay page" className="size-9" render={<a href={payLink} target="_blank" rel="noopener noreferrer" />}><ExternalLink /></Button>
          </div>
          <p className="text-[12px] text-ink-muted">Anyone with the link can see this invoice and pay it by card (Stripe test mode).</p>
        </GlassPanel>
      )}

      {isAdmin && status !== "draft" && status !== "void" && (
        <GlassPanel className="space-y-3 p-5">
          <h2 className="font-heading text-base font-medium text-ink">Card on file</h2>
          {invoice.cards.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No saved card for this customer.</p>
          ) : (
            <ul className="space-y-2">
              {invoice.cards.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="tabular">{c.brand ?? "Card"} ••{c.last4} <span className="text-ink-muted">exp {c.expMonth}/{c.expYear}</span>{c.isDefault && <span className="ml-2 text-[12px] text-ink-muted">default</span>}</span>
                  <Button variant="ghost" size="sm" className="h-8" disabled={pending} onClick={() => window.confirm("Remove this saved card?") && run(() => removeCardOnFile({ id: c.id }), "Card removed")}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" size="sm" className="h-9" disabled={pending} onClick={cardLink}><Link2 aria-hidden /> Copy a save-card link</Button>
          <p className="text-[12px] text-ink-muted">Send it at booking so the card is saved before the clean. The customer is never charged by the link.</p>
        </GlassPanel>
      )}

      {invoice.payments.length > 0 && (
        <GlassPanel className="space-y-3 p-5" aria-label="Payments">
          <h2 className="font-heading text-base font-medium text-ink">Payments</h2>
          <ul className="divide-y divide-hairline" data-testid="payments">
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink tabular">{formatCents(p.amountCents)} <span className="font-normal text-ink-muted">· {methodLabel[p.method] ?? p.method}{p.source === "stripe" ? " (Stripe)" : ""}</span></p>
                  <p className="truncate text-[12px] text-ink-muted tabular">{p.receivedAt ? formatNyDate(p.receivedAt) : "pending"}{p.reference ? ` · ${p.reference}` : ""}</p>
                  {p.refundedCents > 0 && <p className="text-[12px] text-warning tabular">Refunded {formatCents(p.refundedCents)}</p>}
                </div>
                {isAdmin && p.status === "succeeded" && p.refundedCents < p.amountCents && (
                  <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setRefunding(p)}>Record refund</Button>
                )}
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}

      <PaymentDialog open={dialog === "pay"} onOpenChange={(o) => setDialog(o ? "pay" : null)} invoice={invoice} today={today} />
      <ReasonDialog
        open={dialog === "collected"}
        onOpenChange={(o) => setDialog(o ? "collected" : null)}
        title="Mark as collected"
        description="Use this when the money is in hand but isn't going through the app (cash at the door, a check on file). It lets the visit be paid out to the cleaner."
        label="How was it collected?"
        placeholder="Cash handed over on the day, check #1042 deposited…"
        confirm="Mark collected"
        schemaCheck={(text) => {
          const r = markCollectedSchema.safeParse({ invoiceId: invoice.id, note: text });
          return r.success ? null : (r.error.issues[0]?.message ?? "Check the note");
        }}
        onSubmit={(text, done, fail) => run(() => markInvoiceCollected({ invoiceId: invoice.id, note: text }), "Marked collected", done, fail)}
      />
      <ReasonDialog
        open={dialog === "void"}
        onOpenChange={(o) => setDialog(o ? "void" : null)}
        title="Void this invoice"
        description="A void invoice can't be changed or paid. Its visits go back to Ready to invoice."
        label="Why is it void?"
        placeholder="Created by mistake, customer cancelled…"
        confirm="Void invoice"
        danger
        schemaCheck={(text) => {
          const r = voidInvoiceSchema.safeParse({ invoiceId: invoice.id, reason: text });
          return r.success ? null : (r.error.issues[0]?.message ?? "Check the reason");
        }}
        onSubmit={(text, done, fail) => run(() => voidInvoice({ invoiceId: invoice.id, reason: text }), "Invoice voided", done, fail)}
      />
      <RefundDialog open={refunding !== null} onOpenChange={(o) => !o && setRefunding(null)} payment={refunding} />
      {defaultCard && <ChargeDialog open={dialog === "charge"} onOpenChange={(o) => setDialog(o ? "charge" : null)} invoice={invoice} card={defaultCard} />}
    </aside>
  );
}
