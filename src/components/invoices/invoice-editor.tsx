"use client";

import { useMemo, useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteInvoiceDraft, saveInvoice, sendInvoice } from "@/app/actions/invoices";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { invoiceTotals, ppmToPercent, type LineInput } from "@/lib/invoices";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { useFinanceAction } from "./use-finance-action";

type Row = { key: string; jobId: string | null; description: string; quantity: string; price: string; taxable: boolean };

const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
let seq = 0;
const newKey = () => `row-${++seq}`;

type Props = {
  invoiceId: string;
  updatedAt: string;
  lines: { jobId: string | null; description: string; quantity: number; unitPriceCents: number; taxable: boolean }[];
  discountCents: number;
  depositCents: number;
  dueOn: string | null;
  notes: string | null;
  taxRatePpm: number;
  defaultLineTaxable: boolean;
  dueDays: number;
  today: string;
};

/**
 * Edits a draft: lines with a per-line tax switch (off unless Settings turns
 * it on), discount, deposit, due date and notes. Totals update as you type
 * using the same integer math as the database; Save writes them, Save & send
 * issues the invoice (after which it is frozen).
 */
export function InvoiceEditor(p: Props) {
  const router = useRouter();
  const { run, pending } = useFinanceAction();
  const [version, setVersion] = useState(p.updatedAt);
  const [rows, setRows] = useState<Row[]>(() =>
    p.lines.map((l) => ({ key: newKey(), jobId: l.jobId, description: l.description, quantity: String(l.quantity), price: dollars(l.unitPriceCents), taxable: l.taxable })),
  );
  const [discount, setDiscount] = useState(p.discountCents ? dollars(p.discountCents) : "");
  const [deposit, setDeposit] = useState(p.depositCents ? dollars(p.depositCents) : "");
  const [dueOn, setDueOn] = useState(p.dueOn ?? "");
  const [notes, setNotes] = useState(p.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const parsed = useMemo(() => {
    const errs: Record<string, string> = {};
    const lines: LineInput[] = [];
    rows.forEach((r, i) => {
      const qty = Number(r.quantity);
      const price = parseDollarsToCents(r.price === "" ? "0" : r.price);
      if (!r.description.trim()) errs[`d${i}`] = "Describe this line";
      if (!Number.isInteger(qty) || qty < 1) errs[`q${i}`] = "At least 1";
      if (price === null || price < 0) errs[`p${i}`] = "Enter dollars, like 120 or 120.50";
      lines.push({ description: r.description, quantity: Number.isInteger(qty) && qty >= 1 ? qty : 1, unitPriceCents: price !== null && price >= 0 ? price : 0, taxable: r.taxable });
    });
    const disc = parseDollarsToCents(discount === "" ? "0" : discount);
    const dep = parseDollarsToCents(deposit === "" ? "0" : deposit);
    if (disc === null || disc < 0) errs.discount = "Enter dollars";
    if (dep === null || dep < 0) errs.deposit = "Enter dollars";
    const totals = invoiceTotals(lines, disc ?? 0, dep ?? 0, p.taxRatePpm);
    if (disc !== null && disc > totals.subtotalCents) errs.discount = "More than the subtotal";
    if (dep !== null && dep > totals.totalCents) errs.deposit = "More than the total";
    return { errs, lines, totals, disc: disc ?? 0, dep: dep ?? 0 };
  }, [rows, discount, deposit, p.taxRatePpm]);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function payload() {
    return {
      invoiceId: p.invoiceId,
      expectedUpdatedAt: version,
      lines: rows.map((r, i) => ({ description: r.description, quantity: parsed.lines[i].quantity, unitPriceCents: parsed.lines[i].unitPriceCents, taxable: r.taxable, jobId: r.jobId })),
      discountCents: parsed.disc,
      depositCents: parsed.dep,
      dueOn,
      notes,
    };
  }

  function validate(): boolean {
    setErrors(parsed.errs);
    if (Object.keys(parsed.errs).length) {
      toast.error("Fix the highlighted fields first");
      return false;
    }
    return true;
  }

  function save() {
    if (!validate()) return;
    run(() => saveInvoice(payload()), "Draft saved", (r) => setVersion(r.updatedAt));
  }

  function saveAndSend() {
    if (!validate()) return;
    run(
      async () => {
        const saved = await saveInvoice(payload());
        if (!saved.ok) return saved;
        return sendInvoice({ invoiceId: p.invoiceId, expectedUpdatedAt: saved.updatedAt });
      },
      "Invoice sent",
    );
  }

  function discard() {
    if (!window.confirm("Delete this draft invoice? The visit goes back to Ready to invoice.")) return;
    run(
      () => deleteInvoiceDraft({ invoiceId: p.invoiceId }),
      "Draft deleted",
      () => router.push("/invoices"),
    );
  }

  const t = parsed.totals;
  return (
    <GlassPanel as="section" aria-label="Edit invoice" className="space-y-5 p-5">
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-medium text-ink">Lines</h2>
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="grid grid-cols-6 gap-2 rounded-sm border border-hairline p-3 md:grid-cols-12 md:items-start" data-testid="line-row">
              <div className="col-span-6 space-y-1 md:col-span-5">
                <Label htmlFor={`d-${r.key}`} className="md:sr-only">Description</Label>
                <Input id={`d-${r.key}`} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} aria-invalid={Boolean(errors[`d${i}`])} placeholder="Standard clean, inside oven…" className="h-11 md:h-9" />
                {errors[`d${i}`] && <p className="text-[12px] text-danger">{errors[`d${i}`]}</p>}
              </div>
              <div className="col-span-2 space-y-1 md:col-span-1">
                <Label htmlFor={`q-${r.key}`} className="md:sr-only">Qty</Label>
                <Input id={`q-${r.key}`} inputMode="numeric" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} aria-invalid={Boolean(errors[`q${i}`])} className="h-11 text-right md:h-9" />
                {errors[`q${i}`] && <p className="text-[12px] text-danger">{errors[`q${i}`]}</p>}
              </div>
              <div className="col-span-4 space-y-1 md:col-span-2">
                <Label htmlFor={`p-${r.key}`} className="md:sr-only">Price ($)</Label>
                <Input id={`p-${r.key}`} inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} aria-invalid={Boolean(errors[`p${i}`])} placeholder="0.00" className="h-11 text-right md:h-9" />
                {errors[`p${i}`] && <p className="text-[12px] text-danger">{errors[`p${i}`]}</p>}
              </div>
              <div className="col-span-3 flex min-h-11 items-center gap-2 md:col-span-2 md:min-h-9">
                <Checkbox id={`t-${r.key}`} checked={r.taxable} onCheckedChange={(v) => update(r.key, { taxable: v === true })} />
                <Label htmlFor={`t-${r.key}`} className="text-[13px] font-normal text-ink-muted">Taxable</Label>
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1 md:col-span-2">
                <span className="text-sm font-medium text-ink tabular">{formatCents(parsed.lines[i].quantity * parsed.lines[i].unitPriceCents)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" disabled={rows.length === 1 || r.jobId !== null} title={r.jobId ? "A visit's line can't be removed; delete the draft instead" : undefined} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" className="h-9" onClick={() => setRows((rs) => [...rs, { key: newKey(), jobId: null, description: "", quantity: "1", price: "", taxable: p.defaultLineTaxable }])}>
          <Plus aria-hidden /> Add line
        </Button>
        {p.taxRatePpm === 0 && <p className="text-[12px] text-ink-muted">Sales tax is off. Set a rate in Settings, then tick Taxable on the lines it applies to.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-discount">Discount ($)</Label>
          <Input id="inv-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-invalid={Boolean(errors.discount)} placeholder="0.00" className="h-11 md:h-9" />
          {errors.discount && <p className="text-[12px] text-danger">{errors.discount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-deposit">Deposit requested ($)</Label>
          <Input id="inv-deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} aria-invalid={Boolean(errors.deposit)} placeholder="0.00" className="h-11 md:h-9" />
          {errors.deposit && <p className="text-[12px] text-danger">{errors.deposit}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-due">Due date</Label>
          <Input id="inv-due" type="date" value={dueOn} min={p.today} onChange={(e) => setDueOn(e.target.value)} className="h-11 md:h-9" />
          <p className="text-[12px] text-ink-muted">Left blank, it defaults to {p.dueDays} days after sending.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-notes">Notes (shown on the invoice)</Label>
        <Textarea id="inv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you! Zelle to … or pay online with the link." />
      </div>

      <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm" aria-label="Totals">
        <div className="flex justify-between"><dt className="text-ink-muted">Subtotal</dt><dd className="tabular">{formatCents(t.subtotalCents)}</dd></div>
        {t.discountCents > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Discount</dt><dd className="tabular">−{formatCents(t.discountCents)}</dd></div>}
        {p.taxRatePpm > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Sales tax ({ppmToPercent(p.taxRatePpm)}%)</dt><dd className="tabular">{formatCents(t.taxCents)}</dd></div>}
        <div className="flex justify-between border-t border-hairline pt-2 text-lg font-semibold text-ink">
          <dt>Total</dt>
          <dd className="tabular" data-testid="editor-total"><AnimatedNumber value={t.totalCents} kind="cents" /></dd>
        </div>
        {t.depositCents > 0 && <div className="flex justify-between"><dt className="text-ink-muted">Balance after deposit</dt><dd className="tabular">{formatCents(t.totalCents - t.depositCents)}</dd></div>}
      </dl>

      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={discard} disabled={pending} className="h-11 text-danger sm:h-9">
          <Trash2 aria-hidden /> Delete draft
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={save} disabled={pending} className="h-11 sm:h-9">Save draft</Button>
          <Button type="button" onClick={saveAndSend} disabled={pending} className="h-11 sm:h-9" data-testid="save-and-send">
            <Send aria-hidden /> Save &amp; send
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}
