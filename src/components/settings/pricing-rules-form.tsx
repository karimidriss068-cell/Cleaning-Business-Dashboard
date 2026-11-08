"use client";

import { useState } from "react";
import { savePricingRules } from "@/app/actions/pricing";
import { bpsToPercentInput, centsToDollarInput, dollarInputToCents, percentInputToBps, ratePerSqftLabel } from "@/lib/pricing";
import { SPACE_TYPES, pricingRulesSchema, spaceTypeLabel, type PricingSnapshot, type SpaceType } from "@/lib/schemas/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassPanel } from "@/components/system/glass-panel";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";

type Field = { id: string; label: string; hint?: string; kind: "dollars" | "percent" | "number" };

const COSTS: Field[] = [
  { id: "laborRateCents", label: "Labor cost per cleaner-hour ($)", hint: "What one cleaner-hour costs you, pay and payroll costs included.", kind: "dollars" },
  { id: "crewSizeDefault", label: "Usual crew size (people)", kind: "number" },
  { id: "materialsBps", label: "Supplies and equipment (% of labor)", kind: "percent" },
  { id: "travelCents", label: "Travel per clean ($)", kind: "dollars" },
  { id: "contingencyBps", label: "Contingency (% of cost)", hint: "Padding for surprises. 0 adds nothing.", kind: "percent" },
  { id: "minimumProjectCents", label: "Smallest project you'll bid ($)", kind: "dollars" },
  { id: "rushMultiplierBps", label: "Rush work price (% of normal)", hint: "125 means rush work costs 1.25 times normal.", kind: "percent" },
];
const MARGINS: Field[] = [
  { id: "marginTargetBps", label: "Margin target (%)", hint: "Share of the price that is profit. A bid aims for this. Placeholder until you confirm it.", kind: "percent" },
  { id: "marginFloorBps", label: "Margin floor (%)", hint: "A bid below this can't be marked ready without an override that is logged.", kind: "percent" },
  { id: "sellingRateCents", label: "Your selling time per hour ($)", hint: "Used for what it costs to win a project.", kind: "dollars" },
];

const fieldValue = (r: PricingSnapshot, f: Field): string => {
  const v = r[f.id as keyof PricingSnapshot] as number;
  return f.kind === "dollars" ? centsToDollarInput(v) : f.kind === "percent" ? bpsToPercentInput(v) : String(v);
};

/** The owner's bid pricing numbers. Owner and admin only; saving bumps the version that bids record. */
export function PricingRulesForm({ rules }: { rules: PricingSnapshot }) {
  const { run, pending } = useFinanceAction();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([...COSTS, ...MARGINS].map((f) => [f.id, fieldValue(rules, f)])));
  const [spaces, setSpaces] = useState<Record<SpaceType, { rate: string; productivity: string }>>(() =>
    Object.fromEntries(SPACE_TYPES.map((t) => {
      const s = rules.spaceRates.find((x) => x.spaceType === t)!;
      return [t, { rate: centsToDollarInput(s.ratePerKsqftCents), productivity: String(s.productivitySqftPerHour) }];
    })) as Record<SpaceType, { rate: string; productivity: string }>,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const num = (f: Field): number | undefined => {
      const text = values[f.id] ?? "";
      const n = f.kind === "dollars" ? dollarInputToCents(text) : f.kind === "percent" ? percentInputToBps(text) : /^\d+$/.test(text.trim()) ? Number(text) : null;
      if (n === null) next[f.id] = f.kind === "dollars" ? "Enter dollars, like 25" : f.kind === "percent" ? "Enter a percentage, like 30" : "Enter a whole number";
      return n ?? undefined;
    };
    const parsedFields = Object.fromEntries([...COSTS, ...MARGINS].map((f) => [f.id, num(f)]));
    const spaceRates = SPACE_TYPES.map((t) => {
      const rate = dollarInputToCents(spaces[t].rate);
      const prod = /^\d+$/.test(spaces[t].productivity.trim()) ? Number(spaces[t].productivity) : null;
      if (rate === null) next[`rate-${t}`] = "Enter dollars, like 300";
      if (prod === null) next[`prod-${t}`] = "Enter a whole number";
      return { spaceType: t, ratePerKsqftCents: rate ?? -1, productivitySqftPerHour: prod ?? -1 };
    });
    if (Object.keys(next).length > 0) return setErrors(next);
    const parsed = pricingRulesSchema.safeParse({ ...parsedFields, spaceRates });
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(fe)) mapped[k] = v;
      return setErrors(mapped);
    }
    setErrors({});
    run(() => savePricingRules({ expectedVersion: rules.version, rules: parsed.data }), "Pricing rules saved");
  }

  const renderField = (f: Field) => (
    <div key={f.id} className="space-y-1.5">
      <Label htmlFor={`pr-${f.id}`}>{f.label}</Label>
      <Input id={`pr-${f.id}`} inputMode="decimal" value={values[f.id]} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} aria-invalid={Boolean(errors[f.id])} aria-describedby={`pr-${f.id}-h`} className="h-11 md:h-9" />
      <p id={`pr-${f.id}-h`} role={errors[f.id] ? "alert" : undefined} className={errors[f.id] ? "text-[12px] text-danger" : "text-[12px] text-ink-muted"}>{errors[f.id] ?? f.hint ?? " "}</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate aria-label="Pricing rules">
      <GlassPanel as="section" aria-labelledby="pr-costs" className="kc-enter space-y-4 p-5 md:p-6">
        <h2 id="pr-costs" className="font-heading text-lg font-medium text-ink">Costs</h2>
        <div className="grid gap-x-5 gap-y-3 md:grid-cols-2">{COSTS.map(renderField)}</div>
      </GlassPanel>
      <GlassPanel as="section" aria-labelledby="pr-margin" className="kc-enter space-y-4 p-5 md:p-6">
        <h2 id="pr-margin" className="font-heading text-lg font-medium text-ink">Margin and your time</h2>
        <div className="grid gap-x-5 gap-y-3 md:grid-cols-2">{MARGINS.map(renderField)}</div>
        {errors.spaceRates && <p role="alert" className="text-[12px] text-danger">{errors.spaceRates}</p>}
      </GlassPanel>
      <GlassPanel as="section" aria-labelledby="pr-spaces" className="kc-enter space-y-4 p-5 md:p-6">
        <div>
          <h2 id="pr-spaces" className="font-heading text-lg font-medium text-ink">Rates by kind of space</h2>
          <p className="text-[13px] text-ink-muted">The list price per 1,000 sq ft for one clean, and how many sq ft one cleaner covers in an hour.</p>
        </div>
        <ul className="space-y-3">
          {SPACE_TYPES.map((t) => (
            <li key={t} className="grid gap-3 md:grid-cols-[10rem_1fr_1fr] md:items-start">
              <span className="pt-2 text-sm font-medium text-ink">{spaceTypeLabel[t]}</span>
              <div className="space-y-1.5">
                <Label htmlFor={`pr-rate-${t}`} className="text-[12px] text-ink-muted">Price per 1,000 sq ft ($) {errors[`rate-${t}`] ? "" : `· ${ratePerSqftLabel((dollarInputToCents(spaces[t].rate) ?? 0))}/sq ft`}</Label>
                <Input id={`pr-rate-${t}`} inputMode="decimal" value={spaces[t].rate} onChange={(e) => setSpaces({ ...spaces, [t]: { ...spaces[t], rate: e.target.value } })} aria-invalid={Boolean(errors[`rate-${t}`])} className="h-11 md:h-9" />
                {errors[`rate-${t}`] && <p role="alert" className="text-[12px] text-danger">{errors[`rate-${t}`]}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`pr-prod-${t}`} className="text-[12px] text-ink-muted">Sq ft per cleaner-hour</Label>
                <Input id={`pr-prod-${t}`} inputMode="numeric" value={spaces[t].productivity} onChange={(e) => setSpaces({ ...spaces, [t]: { ...spaces[t], productivity: e.target.value } })} aria-invalid={Boolean(errors[`prod-${t}`])} className="h-11 md:h-9" />
                {errors[`prod-${t}`] && <p role="alert" className="text-[12px] text-danger">{errors[`prod-${t}`]}</p>}
              </div>
            </li>
          ))}
        </ul>
      </GlassPanel>
      <div className="flex items-center justify-end gap-3">
        <p className="text-[13px] text-ink-muted">Version {rules.version}. Each bid records the version it used.</p>
        <Button type="submit" disabled={pending} className="h-11 md:h-9">Save pricing rules</Button>
      </div>
    </form>
  );
}
