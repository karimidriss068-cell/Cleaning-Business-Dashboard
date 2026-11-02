import { GlassPanel } from "@/components/system/glass-panel";
import { EmptyState } from "@/components/system/empty-state";
import { BarChart3 } from "lucide-react";
import type { ProfitMonth } from "@/lib/growth-plan";
import type { ChannelRevenue } from "@/lib/vault/replay-data";
import { formatCents } from "@/lib/format";
import { monthLabel, money } from "@/components/growth/format";
import { Chart3D } from "./chart-3d";
import { Sankey } from "./sankey";

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** Revenue by acquisition channel, last 90 days: an orbitable 3D bar or donut. */
export function RevenueByChannelPanel({ data, index = 0 }: { data: ChannelRevenue[]; index?: number }) {
  const total = data.reduce((a, d) => a + d.cents, 0);
  return (
    <GlassPanel as="section" aria-labelledby="by-channel" className="kc-enter p-5 md:p-6" style={stagger(index)} data-testid="revenue-by-channel">
      <div className="mb-3">
        <h2 id="by-channel" className="font-heading text-lg font-medium text-ink">Revenue by channel</h2>
        <p className="text-[13px] text-ink-muted">Invoices issued in the last 90 days, by where the client first came from. Before tax.</p>
      </div>
      {data.length === 0 ? (
        <EmptyState icon={BarChart3} title="No invoiced revenue yet">Once invoices are sent, revenue shows up here by channel.</EmptyState>
      ) : (
        <Chart3D
          title={`${money(total)} in 90 days`}
          data={data.map((d) => ({ key: d.key, label: d.label, cents: d.cents }))}
          ariaLabel={`Revenue by channel over the last 90 days: ${data.map((d) => `${d.label} ${formatCents(Math.round(d.cents / 100) * 100, { hideZeroCents: true })}`).join(", ")}`}
        />
      )}
    </GlassPanel>
  );
}

/** Where this month's revenue went. Owner/admin only (cleaner pay is part of it); the caller passes null for staff. */
export function MoneyFlowPanel({ month, index = 0 }: { month: ProfitMonth | null; index?: number }) {
  if (!month || month.subPayCents === null || month.otherCostsCents === null) return null;
  const costs = month.subPayCents + month.adSpendCents + month.otherCostsCents;
  const net = month.revenueCents - costs;
  return (
    <GlassPanel as="section" aria-labelledby="money-flow" className="kc-enter p-5 md:p-6" style={stagger(index)} data-testid="money-flow">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="money-flow" className="font-heading text-lg font-medium text-ink">Where {monthLabel(month.monthStart)} revenue goes</h2>
          <p className="text-[13px] text-ink-muted">Revenue into cleaner pay, ads and other costs, and what is left. Hover a bar to follow one flow.</p>
        </div>
        <p className="font-heading text-xl font-medium text-ink tabular">{net >= 0 ? "Profit" : "Loss"} {money(Math.abs(net))}</p>
      </div>
      <Sankey
        month={{ revenueCents: month.revenueCents, subPayCents: month.subPayCents, adSpendCents: month.adSpendCents, otherCostsCents: month.otherCostsCents }}
        ariaLabel={`Revenue ${money(month.revenueCents)}, cleaner pay ${money(month.subPayCents)}, ad spend ${money(month.adSpendCents)}, other costs ${money(month.otherCostsCents)}, ${net >= 0 ? "profit" : "loss"} ${money(Math.abs(net))}`}
      />
    </GlassPanel>
  );
}
