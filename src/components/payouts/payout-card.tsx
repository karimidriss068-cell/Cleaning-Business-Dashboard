"use client";

import { useState } from "react";
import { Ban, CheckCircle2, ChevronDown, FileWarning, RotateCcw, Trash2, Wallet } from "lucide-react";
import { approvePayout, deletePayoutDraft, markPayoutPaid, reopenPayout, voidPayout } from "@/app/actions/payouts";
import { formatCalendarDate, formatCents, formatNyDate } from "@/lib/format";
import { PAYOUT_METHODS, markPayoutPaidSchema, methodLabel, voidPayoutSchema } from "@/lib/schemas/finance";
import { payoutLabel, payoutTone } from "@/lib/status";
import type { PayoutView } from "@/lib/finance-data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

const methodItems = PAYOUT_METHODS.map((m) => ({ value: m, label: methodLabel[m] }));

// Each dialog remounts when it opens (key), so its fields start fresh without an effect.
function PaidDialog(props: { payout: PayoutView; today: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  return <PaidDialogInner key={props.open ? "open" : "closed"} {...props} />;
}

function PaidDialogInner({ payout, today, open, onOpenChange }: { payout: PayoutView; today: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, pending } = useFinanceAction();
  const [method, setMethod] = useState<string>("zelle");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { payoutId: payout.id, method, reference, paidOn };
    const parsed = markPayoutPaidSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => markPayoutPaid(input), `${payout.subcontractor} marked paid`, () => onOpenChange(false));
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {formatCents(payout.totalCents)} as paid</DialogTitle>
          <DialogDescription>
            This only records the payment. Send the money to {payout.subcontractor} by Zelle, ACH or check yourself first, then enter the confirmation here.
          </DialogDescription>
        </DialogHeader>
        <form id={`paid-${payout.id}`} onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Paid by</Label>
              <Select items={methodItems} value={method} onValueChange={(v) => v && setMethod(v)}>
                <SelectTrigger className="h-11 w-full md:h-9" aria-label="Paid by"><SelectValue /></SelectTrigger>
                <SelectContent>{methodItems.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`paid-on-${payout.id}`}>Paid on</Label>
              <Input id={`paid-on-${payout.id}`} type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className="h-11 md:h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`paid-ref-${payout.id}`}>Reference</Label>
            <Input id={`paid-ref-${payout.id}`} value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={Boolean(errors.reference)} placeholder="Zelle confirmation, check number…" autoComplete="off" className="h-11 md:h-9" autoFocus />
            {errors.reference && <p role="alert" className="text-[12px] text-danger">{errors.reference}</p>}
          </div>
        </form>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-lg border-hairline bg-transparent px-6 py-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">Cancel</Button>
          <Button type="submit" form={`paid-${payout.id}`} disabled={pending} className="h-11 sm:h-9" data-testid="confirm-paid">{pending ? "Saving…" : "Mark paid"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog(props: { payout: PayoutView; open: boolean; onOpenChange: (o: boolean) => void }) {
  return <VoidDialogInner key={props.open ? "open" : "closed"} {...props} />;
}

function VoidDialogInner({ payout, open, onOpenChange }: { payout: PayoutView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, pending } = useFinanceAction();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = voidPayoutSchema.safeParse({ payoutId: payout.id, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Say why");
    setError(null);
    run(() => voidPayout({ payoutId: payout.id, reason }), "Payout voided", () => onOpenChange(false), setError);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this payout</DialogTitle>
          <DialogDescription>Its visits become payable again on a corrected payout. If money was already sent, sort that out with {payout.subcontractor} separately.</DialogDescription>
        </DialogHeader>
        <form id={`void-${payout.id}`} onSubmit={submit} className="space-y-1.5" noValidate>
          <Label htmlFor={`void-reason-${payout.id}`}>Why?</Label>
          <Textarea id={`void-reason-${payout.id}`} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={Boolean(error)} autoFocus />
          {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
        </form>
        <DialogFooter className="-mx-6 -mb-6 rounded-b-lg border-hairline bg-transparent px-6 py-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="h-11 sm:h-9">Cancel</Button>
          <Button type="submit" form={`void-${payout.id}`} variant="danger" disabled={pending} className="h-11 sm:h-9">Void payout</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One subcontractor's weekly batch: visits, total, and the steps draft -> approved (frozen) -> paid. */
export function PayoutCard({ payout, today, index = 0 }: { payout: PayoutView; today: string; index?: number }) {
  const { run, pending } = useFinanceAction();
  const [dialog, setDialog] = useState<null | "paid" | "void">(null);
  const frozen = payout.status === "approved" || payout.status === "paid";
  return (
    <GlassPanel as="article" level="flat" className="kc-enter p-5" style={{ "--i": index } as React.CSSProperties} aria-label={`${payout.subcontractor} payout`} data-testid="payout-card" data-status={payout.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-medium text-ink">{payout.subcontractor}</h3>
          <p className="text-[13px] text-ink-muted tabular">{payout.items.length} visit{payout.items.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill tone={payoutTone(payout.status)}>{payoutLabel[payout.status]}{frozen && payout.status === "approved" ? " · frozen" : ""}</StatusPill>
          <p className="font-heading text-2xl font-medium text-ink tabular" data-testid="payout-total"><AnimatedNumber value={payout.totalCents} kind="cents" /></p>
        </div>
      </div>

      {!payout.w9OnFile && payout.status !== "paid" && (
        <p className="mt-3 flex items-center gap-2 rounded-sm border border-warning/40 bg-warning-soft px-2.5 py-1.5 text-[13px] text-warning">
          <FileWarning className="size-4 shrink-0" aria-hidden /> No W-9 on file for {payout.subcontractor.split(" ")[0]}. Add one under 1099 tracking.
        </p>
      )}

      <details className="group mt-3">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-brand-text">
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> Visits in this payout
        </summary>
        <ul className="mt-2 divide-y divide-hairline text-sm">
          {payout.items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate"><span className="text-ink">{i.service}</span> <span className="text-ink-muted">· {i.client} · {i.completedOn ? formatCalendarDate(i.completedOn) : ""}</span></span>
              <span className="shrink-0 font-medium text-ink tabular">{formatCents(i.amountCents)}</span>
            </li>
          ))}
        </ul>
      </details>

      {payout.status === "paid" && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-muted">
          <CheckCircle2 className="size-4 text-success" aria-hidden />
          Paid {payout.paidAt ? formatNyDate(payout.paidAt) : ""} by {payout.paidMethod ? methodLabel[payout.paidMethod] : ""} · ref {payout.paidReference}
        </p>
      )}
      {payout.status === "void" && <p className="mt-3 text-[13px] text-ink-muted">Voided: {payout.voidReason}</p>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
        {payout.status === "draft" && (
          <>
            <Button className="h-11 sm:h-9" disabled={pending || payout.totalCents <= 0} onClick={() => run(() => approvePayout({ payoutId: payout.id, expectedUpdatedAt: payout.updatedAt }), "Payout approved and frozen")} data-testid="approve-payout">
              <CheckCircle2 aria-hidden /> Approve
            </Button>
            <Button variant="secondary" className="h-11 sm:h-9" disabled={pending} onClick={() => window.confirm("Delete this draft? You can build it again.") && run(() => deletePayoutDraft({ payoutId: payout.id }), "Draft deleted")}>
              <Trash2 aria-hidden /> Delete draft
            </Button>
          </>
        )}
        {payout.status === "approved" && (
          <>
            <Button className="h-11 sm:h-9" onClick={() => setDialog("paid")} data-testid="mark-paid"><Wallet aria-hidden /> Mark paid</Button>
            <Button variant="secondary" className="h-11 sm:h-9" disabled={pending} onClick={() => run(() => reopenPayout({ payoutId: payout.id }), "Reopened as a draft")}><RotateCcw aria-hidden /> Reopen</Button>
            <Button variant="ghost" className="h-11 text-danger sm:h-9" onClick={() => setDialog("void")}><Ban aria-hidden /> Void</Button>
          </>
        )}
        {payout.status === "paid" && (
          <Button variant="ghost" className="h-11 text-danger sm:h-9" onClick={() => setDialog("void")}><Ban aria-hidden /> Void</Button>
        )}
      </div>

      <PaidDialog payout={payout} today={today} open={dialog === "paid"} onOpenChange={(o) => setDialog(o ? "paid" : null)} />
      <VoidDialog payout={payout} open={dialog === "void"} onOpenChange={(o) => setDialog(o ? "void" : null)} />
    </GlassPanel>
  );
}
