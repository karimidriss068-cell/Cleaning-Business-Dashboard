import type { Capacity, Cash, ScaleLight } from "@/lib/growth";
import { capacityLabel, capacityTone, cashLabel, cashTone, conditionLabel, conditionTone, scaleLabel, scaleTone } from "@/lib/status";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { money } from "./format";

/** Weekly cleans needed for today's clients against what active cleaners cover; warns at 80%. */
export function CapacityPanel({ capacity }: { capacity: Capacity }) {
  return (
    <GlassPanel as="section" aria-labelledby="capacity" className="kc-enter p-5" data-testid="capacity-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="capacity" className="font-heading text-base font-medium text-ink">Cleaner capacity</h3>
        <StatusPill tone={capacityTone[capacity.status]}>{capacityLabel[capacity.status]}</StatusPill>
      </div>
      <p className="mt-3 font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular">
        <AnimatedNumber value={capacity.utilizationPercent} kind="percent" />
        <span className="text-base font-normal text-ink-muted"> of capacity</span>
      </p>
      <Meter className="mt-3" value={capacity.utilizationPercent / 100} marker={0.8} tone={capacityTone[capacity.status]} label="Share of weekly cleaning capacity used" />
      <p className="mt-3 text-[13px] text-ink-muted tabular">
        {capacity.neededPerWeek} cleans a week needed · {capacity.capacityPerWeek} covered by {capacity.activeCleaners} active cleaner{capacity.activeCleaners === 1 ? "" : "s"}. The tick marks 80%.
        {capacity.scheduledNext7Days > 0 ? ` ${capacity.scheduledNext7Days} booked in the next 7 days.` : ""}
      </p>
    </GlassPanel>
  );
}

/** Cash on hand against the minimum buffer, and how long it lasts at the last 30 days' burn. */
export function CashPanel({ cash }: { cash: Cash }) {
  return (
    <GlassPanel as="section" aria-labelledby="cash" className="kc-enter p-5" data-testid="cash-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id="cash" className="font-heading text-base font-medium text-ink">Cash and runway</h3>
        <StatusPill tone={cashTone[cash.status]}>{cashLabel[cash.status]}</StatusPill>
      </div>
      <p className="mt-3 font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular">
        <AnimatedNumber value={Math.round(cash.onHandCents / 100) * 100} kind="cents" hideZeroCents />
        <span className="text-base font-normal text-ink-muted"> on hand</span>
      </p>
      {cash.status !== "ok" && (
        <p role="status" className="mt-2 text-[13px] font-medium text-warning">
          {cash.status === "negative" ? "Cash is below zero." : `Cash is at or under the ${money(cash.bufferCents)} minimum buffer.`}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-ink-muted">Runway</dt>
        <dd className="text-right text-ink tabular">{cash.runwayMonths === null ? "Cash isn't shrinking" : `${cash.runwayMonths} months`}</dd>
        <dt className="text-ink-muted">Collected</dt>
        <dd className="text-right text-ink tabular">{money(cash.collectedCents)}</dd>
        <dt className="text-ink-muted">Payouts</dt>
        <dd className="text-right text-ink tabular">−{money(cash.payoutsCents)}</dd>
        <dt className="text-ink-muted">Ad spend</dt>
        <dd className="text-right text-ink tabular">−{money(cash.adSpendCents)}</dd>
        <dt className="text-ink-muted">Fixed costs</dt>
        <dd className="text-right text-ink tabular">−{money(cash.fixedCostsChargedCents)}</dd>
        <dt className="text-ink-muted">Buffer</dt>
        <dd className="text-right text-ink tabular">{money(cash.bufferCents)}</dd>
      </dl>
    </GlassPanel>
  );
}

/** Green only when replies, capacity, CAC payback and cash all pass; otherwise names each blocker. */
export function ScaleLightPanel({ light }: { light: ScaleLight }) {
  return (
    <GlassPanel as="section" aria-labelledby="scale" className="kc-enter p-5 md:p-6" data-testid="scale-light" data-status={light.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="scale" className="font-heading text-lg font-medium text-ink">Can I scale spend?</h3>
          <p className="mt-1 text-sm text-ink-muted">{light.summary}</p>
        </div>
        <StatusPill tone={scaleTone[light.status]} className="h-8 px-4 text-sm">{scaleLabel[light.status]}</StatusPill>
      </div>
      <ul className="mt-4 divide-y divide-hairline" aria-label="The four conditions">
        {light.conditions.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5" data-testid={`condition-${c.key}`} data-state={c.state}>
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-medium text-ink">{c.label}</p>
              <p className="text-[13px] text-ink-muted">{c.detail}</p>
            </div>
            <StatusPill tone={conditionTone[c.state]}>{conditionLabel[c.state]}</StatusPill>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}
