import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { paceLabel, paceTone, scaleLabel, scaleTone } from "@/lib/status";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { DemoDataPill } from "./demo-pill";
import { PacePill, RevenueColumn, type LivePace } from "./replay-pace";
import { longDate, money } from "./format";

/**
 * The Command Center's growth card: this month's revenue against the plan's
 * milestone, pace, clients won against clients needed per segment, and leads
 * per week against what the plan needs. Staff see it too; the scale light only
 * shows for owner/admin because it depends on cash.
 */
export function GrowthCard({ snapshot, index = 0 }: { snapshot: GrowthSnapshot; index?: number }) {
  const { pace, clients, leads, goal } = snapshot;
  const before = pace.phase === "before";
  const livePace: LivePace = {
    before,
    phase: pace.phase,
    status: pace.status,
    daysAhead: pace.daysAhead,
    monthStart: pace.monthStart,
    revenueCents: pace.revenueCents,
    milestoneCents: pace.milestoneCents,
    expectedToDateCents: pace.expectedToDateCents,
    daysUntilStart: pace.daysUntilStart,
    startDate: goal.startDate,
    goalReached: pace.goalReached,
  };
  const leadsShare = leads.perWeekNeeded > 0 ? leads.perWeekActual / leads.perWeekNeeded : 0;
  return (
    <GlassPanel as="section" aria-labelledby="growth" className="kc-enter p-5 md:p-6" style={{ "--i": index } as React.CSSProperties} data-testid="growth-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="growth" className="font-heading text-lg font-medium text-ink">Growth goal</h2>
          <p className="text-[13px] text-ink-muted">
            {money(goal.monthlyGoalCents)} a month by {longDate(goal.deadline)}
            {pace.phase === "active" && pace.planMonth !== null ? ` · month ${pace.planMonth} of 6` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {snapshot.includesDemo && <DemoDataPill />}
          <PacePill pace={livePace} />
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-3">
        <RevenueColumn pace={livePace} />

        <div className="min-w-0 space-y-3" data-testid="growth-clients">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Clients won vs needed</p>
          {([
            ["Residential recurring", clients.residential, clients.wonThisMonth.residential],
            ["Commercial accounts", clients.commercial, clients.wonThisMonth.commercial],
          ] as const).map(([label, c, won]) => (
            <div key={label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink">{label}</span>
                <span className="text-ink-muted tabular">
                  <AnimatedNumber value={c.have} kind="count" /> of {c.need}
                </span>
              </div>
              <Meter value={c.need > 0 ? c.have / c.need : 0} tone={c.have >= c.need ? "success" : "info"} label={`${label}: ${c.have} of ${c.need}`} />
              <p className="text-[12px] text-ink-muted">{won} booked this month</p>
            </div>
          ))}
        </div>

        <div className="min-w-0 space-y-2" data-testid="growth-leads">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Leads per week</p>
          <p className="font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular">
            {leads.perWeekActual}
            <span className="text-base font-normal text-ink-muted"> of {leads.perWeekNeeded} needed</span>
          </p>
          <Meter value={leadsShare} tone={leadsShare >= 1 ? "success" : leadsShare >= 0.6 ? "info" : "warning"} label="Leads per week against the plan" />
          <p className="text-[13px] text-ink-muted">Average of the last 4 weeks</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline pt-4 text-[13px] text-ink-muted" data-testid="growth-card-tiers">
        <span>12-month north star, month {snapshot.tiers.planMonth === 0 ? "not started" : `${snapshot.tiers.planMonth} of 12`}:</span>
        {snapshot.tiers.paces.map((t) => (
          <span key={t.tier} className="inline-flex items-center gap-1.5" data-selected={t.selected || undefined}>
            <span className={t.selected ? "font-medium text-ink" : undefined}>{t.label}{t.selected ? " (tracking)" : ""}</span>
            {t.pace && snapshot.tiers.planMonth > 0 ? <StatusPill tone={paceTone[t.pace.status]}>{paceLabel[t.pace.status]}</StatusPill> : <StatusPill tone="neutral">{snapshot.tiers.planMonth === 0 ? "Not started" : "Owner/admin only"}</StatusPill>}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-4">
        {snapshot.scaleLight ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted" data-testid="growth-scale-light">
            <StatusPill tone={scaleTone[snapshot.scaleLight.status]}>{scaleLabel[snapshot.scaleLight.status]}</StatusPill>
            {snapshot.scaleLight.blocking.length > 0 && <span>Blocked by {snapshot.scaleLight.blocking.map((b) => b.label.toLowerCase()).join(", ")}</span>}
          </div>
        ) : (
          <span />
        )}
        <nav aria-label="Growth links" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <Link href="/leads" className="text-brand-text underline-offset-4 hover:underline">Leads & pipeline</Link>
          <Link href="/invoices" className="text-brand-text underline-offset-4 hover:underline">Invoices</Link>
          <Link href="/growth" className="inline-flex items-center gap-1 font-medium text-brand-text underline-offset-4 hover:underline">
            Growth plan <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </nav>
      </div>
    </GlassPanel>
  );
}
