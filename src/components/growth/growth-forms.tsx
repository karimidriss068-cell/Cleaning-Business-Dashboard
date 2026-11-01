"use client";

import { useMemo, useState } from "react";
import { saveCashSettings, saveGrowthAssumptions, saveGrowthPlan } from "@/app/actions/growth";
import { formatCents, parseDollarsToCents } from "@/lib/format";
import { addMonths, bpsToPercent, monthStartOf, percentToBps, planNeeds } from "@/lib/growth";
import { assumptionsSchema, cashSchema, planSchema, type GrowthSettings } from "@/lib/schemas/growth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";
import { dollarInput, monthLabel } from "./format";

type Errors = Record<string, string>;

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : hint ? <p className="text-[12px] text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function ReadOnlyNote({ canEdit }: { canEdit: boolean }) {
  return canEdit ? null : <p className="text-[13px] text-ink-muted">Only the owner or an admin can change these.</p>;
}

const dollarsOrNull = (v: string) => parseDollarsToCents(v.trim() === "" ? "" : v);

/** Start date, the monthly goal split into residential and commercial, and the six monthly milestones. */
export function PlanForm({ settings, milestones, canEdit }: { settings: GrowthSettings; milestones: number[]; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [startDate, setStartDate] = useState(settings.startDate);
  const [residential, setResidential] = useState(dollarInput(settings.residentialTargetCents));
  const [commercial, setCommercial] = useState(dollarInput(settings.commercialTargetCents));
  const [ms, setMs] = useState(() => Array.from({ length: 6 }, (_, i) => dollarInput(milestones[i] ?? 0)));
  const [errors, setErrors] = useState<Errors>({});

  const goal = (dollarsOrNull(residential) ?? 0) + (dollarsOrNull(commercial) ?? 0);
  const firstMonth = monthStartOf(/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : settings.startDate);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    const res = dollarsOrNull(residential);
    const com = dollarsOrNull(commercial);
    if (res === null) found.residentialCents = "Enter dollars, like 6400";
    if (com === null) found.commercialCents = "Enter dollars, like 3600";
    const cents = ms.map((m) => dollarsOrNull(m));
    cents.forEach((c, i) => {
      if (c === null) found[`m${i}`] = "Enter dollars";
    });
    if (Object.keys(found).length > 0) return setErrors(found);
    const input = { startDate, residentialCents: res ?? 0, commercialCents: com ?? 0, milestonesCents: cents.map((c) => c ?? 0) };
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) {
      const f = fieldErrors(parsed.error);
      return setErrors({ ...f, ...(f.milestonesCents ? { milestones: f.milestonesCents } : {}) });
    }
    setErrors({});
    run(() => saveGrowthPlan(input), "Growth plan saved");
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Growth goal and milestones">
      <div className="grid gap-5 md:grid-cols-3">
        <Field id="plan-start" label="Start date" error={errors.startDate} hint="Month 1 is the New York month this date falls in.">
          <Input id="plan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" />
        </Field>
        <Field id="plan-res" label="Residential recurring target ($ a month)" error={errors.residentialCents}>
          <Input id="plan-res" inputMode="decimal" value={residential} onChange={(e) => setResidential(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.residentialCents)} className="h-11 md:h-9" />
        </Field>
        <Field id="plan-com" label="Commercial target ($ a month)" error={errors.commercialCents}>
          <Input id="plan-com" inputMode="decimal" value={commercial} onChange={(e) => setCommercial(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.commercialCents)} className="h-11 md:h-9" />
        </Field>
      </div>
      <p className="text-[13px] text-ink-muted tabular">
        Monthly goal: <span className="font-medium text-ink">{formatCents(goal, { hideZeroCents: true })}</span>, reached by {monthLabel(monthStartOf(addMonths(firstMonth, 5)))} or sooner.
      </p>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Monthly revenue milestones</legend>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {ms.map((value, i) => (
            <Field key={i} id={`plan-m${i}`} label={`Month ${i + 1} · ${monthLabel(addMonths(firstMonth, i))}`} error={errors[`m${i}`]}>
              <Input
                id={`plan-m${i}`}
                inputMode="decimal"
                value={value}
                onChange={(e) => setMs((cur) => cur.map((x, j) => (j === i ? e.target.value : x)))}
                disabled={!canEdit}
                aria-invalid={Boolean(errors[`m${i}`] || errors.milestones)}
                className="h-11 md:h-9"
              />
            </Field>
          ))}
        </div>
        {errors.milestones ? <p role="alert" className="text-[12px] text-danger">{errors.milestones}</p> : <p className="text-[12px] text-ink-muted">Each month should be at least the one before, and the last must equal the monthly goal.</p>}
      </fieldset>
      {canEdit ? <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-growth-plan">{pending ? "Saving…" : "Save plan"}</Button> : <ReadOnlyNote canEdit={canEdit} />}
    </form>
  );
}

/** The numbers the plan is built on, with a live read-out of the accounts and leads they imply. */
export function AssumptionsForm({ settings, canEdit }: { settings: GrowthSettings; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [price, setPrice] = useState(dollarInput(settings.resVisitPriceCents));
  const [visits, setVisits] = useState(String(settings.resVisitsPerMonth));
  const [account, setAccount] = useState(dollarInput(settings.commAccountValueCents));
  const [close, setClose] = useState(bpsToPercent(settings.closeRateBps));
  const [cac, setCac] = useState(dollarInput(settings.cacCents));
  const [margin, setMargin] = useState(bpsToPercent(settings.marginBps));
  const [budget, setBudget] = useState(dollarInput(settings.monthlyAdBudgetCents));
  const [reply, setReply] = useState(String(settings.replyTargetMinutes));
  const [perCleaner, setPerCleaner] = useState(String(settings.cleansPerCleanerPerWeek));
  const [errors, setErrors] = useState<Errors>({});

  // The read-out follows what is typed; a field that isn't valid yet keeps its saved value.
  const needs = useMemo(() => {
    const p = dollarsOrNull(price);
    const a = dollarsOrNull(account);
    const c = percentToBps(close);
    const v = Number(visits);
    return planNeeds({
      ...settings,
      resVisitPriceCents: p !== null && p > 0 ? p : settings.resVisitPriceCents,
      resVisitsPerMonth: Number.isInteger(v) && v >= 1 && v <= 31 ? v : settings.resVisitsPerMonth,
      commAccountValueCents: a !== null && a > 0 ? a : settings.commAccountValueCents,
      closeRateBps: c ?? settings.closeRateBps,
      cacCents: dollarsOrNull(cac) ?? settings.cacCents,
    });
  }, [settings, price, visits, account, close, cac]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    const p = dollarsOrNull(price);
    const a = dollarsOrNull(account);
    const c = dollarsOrNull(cac);
    const b = dollarsOrNull(budget);
    const closeBps = percentToBps(close);
    const marginBps = percentToBps(margin);
    if (p === null) found.visitPriceCents = "Enter dollars, like 180";
    if (a === null) found.accountValueCents = "Enter dollars, like 600";
    if (c === null) found.cacCents = "Enter dollars, like 250";
    if (b === null) found.adBudgetCents = "Enter dollars, like 1000";
    if (closeBps === null) found.closeRateBps = "Enter a percent from 0.01 to 100";
    if (marginBps === null) found.marginBps = "Enter a percent from 0.01 to 100";
    if (Object.keys(found).length > 0) return setErrors(found);
    const input = {
      visitPriceCents: p ?? 0,
      visitsPerMonth: Number(visits),
      accountValueCents: a ?? 0,
      closeRateBps: closeBps ?? 0,
      cacCents: c ?? 0,
      marginBps: marginBps ?? 0,
      adBudgetCents: b ?? 0,
      replyTargetMinutes: Number(reply),
      cleansPerCleaner: Number(perCleaner),
    };
    const parsed = assumptionsSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => saveGrowthAssumptions(input), "Assumptions saved");
  }

  const input = (id: string, value: string, set: (v: string) => void, key: string, mode: "decimal" | "numeric" = "decimal") => (
    <Input id={id} inputMode={mode} value={value} onChange={(e) => set(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors[key])} className="h-11 md:h-9" />
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Growth assumptions">
      <div className="grid gap-5 md:grid-cols-3">
        <Field id="as-price" label="Residential visit price ($)" error={errors.visitPriceCents}>{input("as-price", price, setPrice, "visitPriceCents")}</Field>
        <Field id="as-visits" label="Visits per month per client" error={errors.visitsPerMonth}>{input("as-visits", visits, setVisits, "visitsPerMonth", "numeric")}</Field>
        <Field id="as-account" label="Commercial account value ($ a month)" error={errors.accountValueCents}>{input("as-account", account, setAccount, "accountValueCents")}</Field>
        <Field id="as-close" label="Lead to booked close rate (%)" error={errors.closeRateBps}>{input("as-close", close, setClose, "closeRateBps")}</Field>
        <Field id="as-cac" label="Cost to win a client ($)" error={errors.cacCents} hint="Used until there are 3 booked clients from ads in the last 30 days.">{input("as-cac", cac, setCac, "cacCents")}</Field>
        <Field id="as-margin" label="Margin (%)" error={errors.marginBps}>{input("as-margin", margin, setMargin, "marginBps")}</Field>
        <Field id="as-budget" label="Monthly ad budget ($)" error={errors.adBudgetCents}>{input("as-budget", budget, setBudget, "adBudgetCents")}</Field>
        <Field id="as-reply" label="Lead reply target (minutes)" error={errors.replyTargetMinutes}>{input("as-reply", reply, setReply, "replyTargetMinutes", "numeric")}</Field>
        <Field id="as-cleaner" label="Cleans per cleaner per week" error={errors.cleansPerCleaner} hint="Cleaners have no availability hours yet, so capacity is active cleaners times this.">{input("as-cleaner", perCleaner, setPerCleaner, "cleansPerCleaner", "numeric")}</Field>
      </div>
      <dl className="grid gap-3 rounded-md border border-hairline p-4 sm:grid-cols-4" data-testid="needs-readout" aria-label="What these assumptions need">
        {[
          ["Residential clients needed", String(needs.residential)],
          ["Commercial accounts needed", String(needs.commercial)],
          ["Leads needed per week", String(needs.leadsPerWeek)],
          ["Winning them costs", formatCents(needs.acquisitionBudgetCents, { hideZeroCents: true })],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{k}</dt>
            <dd className="font-heading text-xl font-medium text-ink tabular" data-testid={`needs-${k.split(" ")[0].toLowerCase()}-${k.split(" ")[1].toLowerCase()}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {canEdit ? <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-growth-assumptions">{pending ? "Saving…" : "Save assumptions"}</Button> : <ReadOnlyNote canEdit={canEdit} />}
    </form>
  );
}

/** Starting capital, fixed costs and the minimum cash buffer. */
export function CashForm({ settings, canEdit }: { settings: GrowthSettings; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [capital, setCapital] = useState(dollarInput(settings.startingCapitalCents));
  const [since, setSince] = useState(settings.cashStartDate);
  const [fixed, setFixed] = useState(dollarInput(settings.monthlyFixedCostsCents));
  const [buffer, setBuffer] = useState(dollarInput(settings.minBufferCents));
  const [errors, setErrors] = useState<Errors>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Errors = {};
    const c = dollarsOrNull(capital);
    const f = dollarsOrNull(fixed);
    const b = dollarsOrNull(buffer);
    if (c === null) found.startingCents = "Enter dollars, like 5000";
    if (f === null) found.fixedCents = "Enter dollars, like 1500";
    if (b === null) found.bufferCents = "Enter dollars, like 1000";
    if (Object.keys(found).length > 0) return setErrors(found);
    const input = { startingCents: c ?? 0, cashStartDate: since, fixedCents: f ?? 0, bufferCents: b ?? 0 };
    const parsed = cashSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => saveCashSettings(input), "Cash settings saved");
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Cash settings">
      <div className="grid gap-5 md:grid-cols-4">
        <Field id="cash-capital" label="Starting capital ($)" error={errors.startingCents}>
          <Input id="cash-capital" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.startingCents)} className="h-11 md:h-9" />
        </Field>
        <Field id="cash-since" label="Counting cash from" error={errors.cashStartDate} hint="Collections, payouts and ads before this date are ignored.">
          <Input id="cash-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} disabled={!canEdit} className="h-11 md:h-9" />
        </Field>
        <Field id="cash-fixed" label="Monthly fixed costs ($)" error={errors.fixedCents} hint="Charged for each full month since the start date.">
          <Input id="cash-fixed" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.fixedCents)} className="h-11 md:h-9" />
        </Field>
        <Field id="cash-buffer" label="Minimum cash buffer ($)" error={errors.bufferCents}>
          <Input id="cash-buffer" inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.bufferCents)} className="h-11 md:h-9" />
        </Field>
      </div>
      {canEdit ? <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-cash-settings">{pending ? "Saving…" : "Save cash settings"}</Button> : <ReadOnlyNote canEdit={canEdit} />}
    </form>
  );
}
