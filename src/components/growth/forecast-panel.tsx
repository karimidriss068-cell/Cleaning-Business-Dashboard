import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { money } from "./format";

/** What each tier takes by month 12: revenue, clients, cleans a week, crews and ad budget, against what you have now. */
export function ForecastPanel({ snapshot }: { snapshot: GrowthSnapshot }) {
  const have = snapshot.clients.residential.have + snapshot.clients.commercial.have;
  const haveCrews = snapshot.capacity.activeCleaners;
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-testid="forecast-panel">
      {snapshot.forecast.map((f) => (
        <GlassPanel key={f.tier} as="section" aria-label={`${f.label} forecast`} level="flat" className="kc-enter min-w-0 space-y-3 p-5" data-testid={`forecast-${f.tier}`}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading text-base font-medium text-ink">{f.label}</h3>
            {snapshot.tiers.selected === f.tier && <StatusPill tone="info">Tracking</StatusPill>}
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-muted">Revenue a month</dt>
            <dd className="text-right font-medium text-ink tabular">{money(f.revenueCents)}</dd>
            <dt className="text-ink-muted">Clients</dt>
            <dd className="text-right text-ink tabular">{f.clients} <span className="text-ink-muted">({f.residentialClients} home + {f.commercialAccounts} commercial)</span></dd>
            <dt className="text-ink-muted">Cleans a week</dt>
            <dd className="text-right text-ink tabular">{f.cleansPerWeek}</dd>
            <dt className="text-ink-muted">Crews</dt>
            <dd className="text-right text-ink tabular">{f.crews}{f.crewsToAdd > 0 ? <span className="text-ink-muted"> (+{f.crewsToAdd})</span> : null}</dd>
            <dt className="text-ink-muted">Clients to win in 12 months</dt>
            <dd className="text-right text-ink tabular">{f.winsNeeded}</dd>
            <dt className="text-ink-muted">Leads a week</dt>
            <dd className="text-right text-ink tabular">{f.leadsPerWeek}</dd>
            <dt className="text-ink-muted">Ad budget a month</dt>
            <dd className="text-right text-ink tabular">{money(f.adBudgetMonthlyCents)}</dd>
          </dl>
          <p className="text-[12px] text-ink-muted tabular">
            You have {have} clients and {haveCrews} active cleaner{haveCrews === 1 ? "" : "s"} now: {f.clientsToAdd} more clients to add.
            {f.tier === "north_star" ? " Profit target turned into revenue at the margin assumption." : ""}
          </p>
        </GlassPanel>
      ))}
    </div>
  );
}
