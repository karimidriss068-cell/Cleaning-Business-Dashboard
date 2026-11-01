"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteExpense, recordExpense } from "@/app/actions/growth";
import { formatCalendarDate, formatCents, parseDollarsToCents } from "@/lib/format";
import { EXPENSE_CATEGORIES, expenseSchema } from "@/lib/schemas/growth";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

const categoryItems = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }));
const categoryLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

/** Other costs that feed profit. Cleaner pay and ad spend are already counted, so don't enter them here. */
export function ExpensePanel({ expenses, canEdit, today }: { expenses: NonNullable<GrowthSnapshot["profit"]>["expenses"]; canEdit: boolean; today: string }) {
  const { run, pending } = useFinanceAction();
  const [category, setCategory] = useState<string>("supplies");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseDollarsToCents(amount);
    if (cents === null) return setErrors({ amountCents: "Enter dollars, like 85.50" });
    const input = { category, amountCents: cents, date, description: description.trim() === "" ? undefined : description };
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => recordExpense(input), "Expense saved", () => {
      setAmount("");
      setDescription("");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="expense-panel">
      <GlassPanel as="div" className="min-w-0 p-5">
        <h3 className="font-heading text-base font-medium text-ink">Add an expense</h3>
        <p className="mb-4 text-[13px] text-ink-muted">Supplies, software, insurance and the like. Cleaner pay and ad spend are already counted, so don&apos;t enter them here. Cash uses the fixed-costs setting, not these.</p>
        {canEdit ? (
          <form onSubmit={submit} className="space-y-4" noValidate aria-label="Add an expense">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select items={categoryItems} value={category} onValueChange={(v) => v && setCategory(v)}>
                  <SelectTrigger className="h-11 w-full min-w-0 md:h-9" aria-label="Category"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
                  <SelectContent>{categoryItems.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-amount">Amount ($)</Label>
                <Input id="exp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.amountCents)} className="h-11 md:h-9" placeholder="85.50" />
                {errors.amountCents && <p role="alert" className="text-[12px] text-danger">{errors.amountCents}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Date</Label>
                <Input id="exp-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-11 md:h-9" />
                {errors.date && <p role="alert" className="text-[12px] text-danger">{errors.date}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-desc">Note (optional)</Label>
              <Input id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="h-11 md:h-9" />
            </div>
            <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="add-expense">{pending ? "Saving…" : "Add expense"}</Button>
          </form>
        ) : (
          <p className="text-[13px] text-ink-muted">Only the owner or an admin can add expenses.</p>
        )}
      </GlassPanel>
      <GlassPanel as="div" className="min-w-0 overflow-hidden">
        <div className="border-b border-hairline px-5 py-4"><h3 className="font-heading text-base font-medium text-ink">Recent expenses</h3></div>
        {expenses.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">No expenses yet.</p>
        ) : (
          <ul className="divide-y divide-hairline" data-testid="expense-list">
            {expenses.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{categoryLabel(x.category)}</span>
                  <span className="text-ink-muted"> · {formatCalendarDate(x.date)} · {x.description}</span>
                  {x.isDemo && <span className="ml-2 align-middle"><StatusPill tone="warning">Demo</StatusPill></span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-ink tabular">{formatCents(x.amountCents, { hideZeroCents: true })}</span>
                  {canEdit && (
                    <Button type="button" variant="ghost" size="icon" className="size-11 md:size-8" aria-label={`Delete ${categoryLabel(x.category)} expense of ${formatCents(x.amountCents, { hideZeroCents: true })} on ${formatCalendarDate(x.date)}`} disabled={pending} onClick={() => run(() => deleteExpense({ id: x.id }), "Expense deleted")}>
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
