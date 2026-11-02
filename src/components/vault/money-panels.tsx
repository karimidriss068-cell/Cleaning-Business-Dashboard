import { GlassPanel } from "@/components/system/glass-panel";
import { EmptyState } from "@/components/system/empty-state";
import { BarChart3 } from "lucide-react";
import type { ProfitMonth } from "@/lib/growth-plan";
import type { ChannelStreamData } from "@/lib/vault/replay-data";
import { formatCents } from "@/lib/format";
import { monthLabel, money } from "@/components/growth/format";
import { ChannelStream } from "./channel-stream";
import { Sankey } from "./sankey";

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

/** Revenue by acquisition channel over the last 13 weeks, as flowing ribbons. */
export function RevenueByChannelPanel({ data, index = 0 }: { data: ChannelStreamData; index?: number }) {
  const total = data.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
  return (
    <GlassPanel as="section" aria-labelledby="by-channel" className="kc-enter p-6 md:p-8" style={stagger(index)} data-testid="revenue-by-channel">
      <div className="mb-5">
        <h2 id="by-channel" className="font-heading text-lg font-medium text-ink">Revenue by channel</h2>
        <p className="text-[13px] text-ink-muted">Where invoiced revenue came from, week by week. Before tax.</p>
      </div>
      {total === 0 ? (
        <EmptyState icon={BarChart3} title="No invoiced revenue yet">Once invoices are sent, revenue shows up here by channel.</EmptyState>
      ) : (
        <ChannelStream
          weeks={data.weeks}
          series={data.series}
          ariaLabel={`Revenue by channel over the last 13 weeks: ${data.series.map((s) => `${s.label} ${formatCents(Math.round(s.values.reduce((a, b) => a + b, 0) / 100) * 100, { hideZeroCents: true })}`).join(", ")}`}
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
    <GlassPanel as="section" aria-labelledby="money-flow" className="kc-enter p-6 md:p-8" style={stagger(index)} data-testid="money-flow">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="money-flow" className="font-heading text-lg font-medium text-ink">Where {monthLabel(month.monthStart)} revenue goes</h2>
          <p className="text-[13px] text-ink-muted">Revenue into costs, and what is left.</p>
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
