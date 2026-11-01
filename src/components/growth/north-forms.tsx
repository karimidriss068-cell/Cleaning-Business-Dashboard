"use client";

import { useState } from "react";
import { saveForecastAssumptions, saveTierSettings } from "@/app/actions/growth";
import { parseDollarsToCents } from "@/lib/format";
import { bpsToPercent, percentToBps } from "@/lib/growth";
import { tierLabel } from "@/lib/growth-plan";
import { TIERS, forecastSchema, tierSettingsSchema, type SettingsExtra, type TierKey } from "@/lib/schemas/growth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";
import { dollarInput } from "./format";

type Errors = Record<string, string>;

/** Which tier to track, and the three monthly targets. */
export function TierForm({ extra, canEdit }: { extra: SettingsExtra; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [tier, setTier] = useState<TierKey>(extra.tier);
  const [base, setBase] = useState(dollarInput(extra.tierBaseRevenueCents));
  const [strong, setStrong] = useState(dollarInput(extra.tierStrongRevenueCents));
  const [north, setNorth] = useState(dollarInput(extra.tierNorthProfitCents));
  const [errors, setErrors] = useState<Errors>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = parseDollarsToCents(base);
    const s = parseDollarsToCents(strong);
    const n = parseDollarsToCents(north);
    const found: Errors = {};
    if (b === null) found.baseCents = "Enter dollars, like 50000";
    if (s === null) found.strongCents = "Enter dollars, like 100000";
    if (n === null) found.northProfitCents = "Enter dollars, like 50000";
    if (Object.keys(found).length > 0) return setErrors(found);
    const input = { tier, baseCents: b ?? 0, strongCents: s ?? 0, northProfitCents: n ?? 0 };
    const parsed = tierSettingsSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => saveTierSettings(input), "Tiers saved");
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate aria-label="Tiers">
      <div role="radiogroup" aria-label="Tier to track" className="grid gap-2 sm:grid-cols-3">
        {TIERS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tier === t} disabled={!canEdit} onClick={() => setTier(t)} data-testid={`tier-pick-${t}`} className={cn("h-11 rounded-sm border text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 md:h-9", tier === t ? "border-brand bg-highlight text-ink" : "border-hairline text-ink-muted")}>
            Track {tierLabel[t]}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="tier-base">Base: revenue a month by month 12 ($)</Label>
          <Input id="tier-base" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.baseCents)} className="h-11 md:h-9" />
          {errors.baseCents && <p role="alert" className="text-[12px] text-danger">{errors.baseCents}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tier-strong">Strong: revenue a month ($)</Label>
          <Input id="tier-strong" inputMode="decimal" value={strong} onChange={(e) => setStrong(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.strongCents)} className="h-11 md:h-9" />
          {errors.strongCents && <p role="alert" className="text-[12px] text-danger">{errors.strongCents}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tier-north">North star: net profit a month ($)</Label>
          <Input id="tier-north" inputMode="decimal" value={north} onChange={(e) => setNorth(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.northProfitCents)} className="h-11 md:h-9" />
          {errors.northProfitCents && <p role="alert" className="text-[12px] text-danger">{errors.northProfitCents}</p>}
        </div>
      </div>
      <p className="text-[12px] text-ink-muted">Each tier follows the same 12-month ramp, which is shaped by the revenue the gates ask for at months 3, 6 and 9.</p>
      {canEdit ? <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-tiers">{pending ? "Saving…" : "Save tiers"}</Button> : <p className="text-[13px] text-ink-muted">Only the owner or an admin can change these.</p>}
    </form>
  );
}

/** Monthly churn and how many cleans a crew does a week, for the forecast. */
export function ForecastForm({ extra, canEdit }: { extra: SettingsExtra; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [churn, setChurn] = useState(bpsToPercent(extra.monthlyChurnBps));
  const [perCrew, setPerCrew] = useState(String(extra.cleansPerCrewPerWeek));
  const [errors, setErrors] = useState<Errors>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const bps = churn.trim() === "0" ? 0 : percentToBps(churn);
    if (bps === null) return setErrors({ churnBps: "Enter a percent from 0 to 100" });
    const input = { churnBps: bps, cleansPerCrew: Number(perCrew) };
    const parsed = forecastSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => saveForecastAssumptions(input), "Forecast assumptions saved");
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-label="Forecast assumptions">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fc-churn">Monthly churn (%)</Label>
          <Input id="fc-churn" inputMode="decimal" value={churn} onChange={(e) => setChurn(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.churnBps)} className="h-11 md:h-9" />
          {errors.churnBps ? <p role="alert" className="text-[12px] text-danger">{errors.churnBps}</p> : <p className="text-[12px] text-ink-muted">Recurring clients who cancel in a month. The tracker shows your real rate.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fc-crew">Cleans per crew per week</Label>
          <Input id="fc-crew" inputMode="numeric" value={perCrew} onChange={(e) => setPerCrew(e.target.value)} disabled={!canEdit} aria-invalid={Boolean(errors.cleansPerCrew)} className="h-11 md:h-9" />
          {errors.cleansPerCrew && <p role="alert" className="text-[12px] text-danger">{errors.cleansPerCrew}</p>}
        </div>
      </div>
      {canEdit ? <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-forecast">{pending ? "Saving…" : "Save forecast assumptions"}</Button> : <p className="text-[13px] text-ink-muted">Only the owner or an admin can change these.</p>}
    </form>
  );
}
