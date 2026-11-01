import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { paceLabel, paceTone, scaleLabel, scaleTone } from "@/lib/status";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { DemoDataPill } from "./demo-pill";
import { longDate, money, monthLabel, paceSentence } from "./format";

/**
 * The Command Center's growth card: this month's revenue against the plan's
 * milestone, pace, clients won against clients needed per segment, and leads
 * per week against what the plan needs. Staff see it too; the scale light only
 * shows for owner/admin because it depends on cash.
 */
export function GrowthCard({ snapshot, index = 0 }: { snapshot: GrowthSnapshot; index?: number }) {
  const { pace, clients, leads, goal } = snapshot;
  const before = pace.phase === "before";
  const share = pace.milestoneCents > 0 ? pace.revenueCents / pace.milestoneCents : 0;
  const expectedShare = pace.milestoneCents > 0 ? pace.expectedToDateCents / pace.milestoneCents : 0;
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
          {before ? (
            <StatusPill tone="neutral">Starts {longDate(goal.startDate)}</StatusPill>
          ) : (
            <StatusPill tone={paceTone[pace.status]}>{paceLabel[pace.status]}</StatusPill>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-3">
        <div className="min-w-0 space-y-2" data-testid="growth-revenue">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Revenue, {monthLabel(pace.monthStart)}</p>
          <p className="font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular">
            <AnimatedNumber value={Math.round(pace.revenueCents / 100) * 100} kind="cents" hideZeroCents />
          </p>
          <Meter value={share} marker={before ? undefined : expectedShare} tone={before ? "neutral" : paceTone[pace.status]} label="Revenue against this month's milestone" />
          <p className="text-[13px] text-ink-muted tabular">
            {before ? `Month 1 asks for ${money(pace.milestoneCents)}. ${pace.daysUntilStart} days to go.` : `of ${money(pace.milestoneCents)} milestone · ${paceSentence(pace.daysAhead)}`}
          </p>
          {pace.goalReached && (
            <p className="text-[13px] font-medium text-success">
              Full goal reached in {monthLabel(pace.goalReached.monthStart)}
              {pace.goalReached.monthsEarly > 0 ? `, ${pace.goalReached.monthsEarly} month${pace.goalReached.monthsEarly === 1 ? "" : "s"} early` : ""}.
            </p>
          )}
        </div>

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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-4">
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
