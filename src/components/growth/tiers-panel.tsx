import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { paceLabel, paceTone } from "@/lib/status";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { money, monthLabel, paceSentence } from "./format";

const unit: Record<"revenue" | "profit", string> = { revenue: "revenue", profit: "net profit" };

/**
 * The three tiers side by side. The one you track is marked; every tier shows
 * how this month compares with where its 12-month ramp says you should be.
 */
export function TiersPanel({ snapshot }: { snapshot: GrowthSnapshot }) {
  const { tiers } = snapshot;
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="tiers-panel">
      {tiers.paces.map((t) => {
        const share = t.monthTargetCents > 0 && t.actualCents !== null ? t.actualCents / t.monthTargetCents : 0;
        const expectedShare = t.pace && t.monthTargetCents > 0 ? t.pace.expectedToDateCents / t.monthTargetCents : undefined;
        return (
          <GlassPanel key={t.tier} as="section" aria-label={`${t.label} tier`} level={t.selected ? "card" : "flat"} className="kc-enter min-w-0 space-y-3 p-5" data-testid={`tier-${t.tier}`} data-selected={t.selected || undefined}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-base font-medium text-ink">{t.label}</h3>
                <p className="text-[13px] text-ink-muted tabular">{money(t.fullTargetCents)} a month of {unit[t.metric]} by month 12</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {t.selected && <StatusPill tone="info">Tracking</StatusPill>}
                {t.pace && tiers.planMonth > 0 ? <StatusPill tone={paceTone[t.pace.status]}>{paceLabel[t.pace.status]}</StatusPill> : <StatusPill tone="neutral">{tiers.planMonth === 0 ? "Not started" : "Owner/admin only"}</StatusPill>}
              </div>
            </div>
            {t.actualCents === null ? (
              <p className="text-sm text-ink-muted">Net profit includes what cleaners are paid, so only the owner or an admin sees it.</p>
            ) : (
              <>
                <p className="font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular">
                  <AnimatedNumber value={Math.round(t.actualCents / 100) * 100} kind="cents" hideZeroCents />
                  <span className="text-base font-normal text-ink-muted"> {monthLabel(snapshot.pace.monthStart)}</span>
                </p>
                <Meter value={share} marker={expectedShare} tone={t.pace && tiers.planMonth > 0 ? paceTone[t.pace.status] : "neutral"} label={`${t.label}: ${unit[t.metric]} this month against the ramp`} />
                <p className="text-[13px] text-ink-muted tabular">
                  {tiers.planMonth === 0
                    ? `Month 1 asks for ${money(Math.round(t.fullTargetCents * (tiers.ramp[1] ?? 0)))}.`
                    : `of ${money(t.monthTargetCents)} due this month${t.pace ? ` · ${paceSentence(t.pace.daysAhead)}` : ""}`}
                </p>
              </>
            )}
          </GlassPanel>
        );
      })}
    </div>
  );
}
