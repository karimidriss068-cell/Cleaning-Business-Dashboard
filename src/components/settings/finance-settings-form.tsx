"use client";

import { useState } from "react";
import { updateFinanceSettings } from "@/app/actions/payouts";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { ppmToPercent } from "@/lib/invoices";
import { settingsFormSchema } from "@/lib/schemas/finance";
import type { FinanceSettings } from "@/lib/finance-data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** Sales tax, due dates and the 1099 threshold. Owner/admin edit; everyone on the team can see them. */
export function FinanceSettingsForm({ settings, canEdit }: { settings: FinanceSettings; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [taxRate, setTaxRate] = useState(ppmToPercent(settings.taxRatePpm));
  const [taxable, setTaxable] = useState(settings.defaultLineTaxable);
  const [dueDays, setDueDays] = useState(String(settings.invoiceDueDays));
  const [threshold, setThreshold] = useState(dollars(settings.thresholdCents));
  const [warn, setWarn] = useState(String(Math.round(settings.warnBps / 100)));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(threshold);
    if (cents === null) return setErrors({ thresholdCents: "Enter dollars, like 2000" });
    const input = { taxRate, defaultLineTaxable: taxable, invoiceDueDays: Number(dueDays), thresholdCents: cents, warnPercent: Number(warn) };
    const parsed = settingsFormSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => updateFinanceSettings(input), "Settings saved");
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Invoicing and payout settings">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="set-tax">Sales tax rate (%)</Label>
          <Input id="set-tax" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.taxRate)} className="h-11 md:h-9" />
          {errors.taxRate ? <p role="alert" className="text-[12px] text-danger">{errors.taxRate}</p> : <p className="text-[12px] text-ink-muted">0 turns tax off. Confirm the rate with your accountant. It is taken when an invoice is created.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-due">Days until an invoice is due</Label>
          <Input id="set-due" inputMode="numeric" value={dueDays} onChange={(e) => setDueDays(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.invoiceDueDays)} className="h-11 md:h-9" />
          {errors.invoiceDueDays && <p role="alert" className="text-[12px] text-danger">{errors.invoiceDueDays}</p>}
        </div>
        <div className="flex items-start gap-2.5 md:col-span-2">
          <Checkbox id="set-taxable" checked={taxable} onCheckedChange={(v) => setTaxable(v === true)} disabled={!canEdit} className="mt-0.5" />
          <div>
            <Label htmlFor="set-taxable" className="font-medium">Tax new invoice lines by default</Label>
            <p className="text-[12px] text-ink-muted">Off by default. Each line can still be switched on or off on the invoice.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-threshold">1099 reporting threshold ($ per subcontractor per year)</Label>
          <Input id="set-threshold" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.thresholdCents)} className="h-11 md:h-9" />
          {errors.thresholdCents ? <p role="alert" className="text-[12px] text-danger">{errors.thresholdCents}</p> : <p className="text-[12px] text-ink-muted">Currently {formatCents(settings.thresholdCents, { hideZeroCents: true })}. Check the current IRS figure with your accountant before relying on it.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-warn">Warn when a subcontractor reaches (% of the threshold)</Label>
          <Input id="set-warn" inputMode="numeric" value={warn} onChange={(e) => setWarn(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.warnPercent)} className="h-11 md:h-9" />
          {errors.warnPercent && <p role="alert" className="text-[12px] text-danger">{errors.warnPercent}</p>}
        </div>
      </div>
      {canEdit ? (
        <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-finance-settings">{pending ? "Saving…" : "Save settings"}</Button>
      ) : (
        <p className="text-[13px] text-ink-muted">Only the owner or an admin can change these.</p>
      )}
    </form>
  );
}
