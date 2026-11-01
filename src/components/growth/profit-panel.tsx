import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { formatCents } from "@/lib/format";
import { AnimatedNumber } from "@/components/system/animated-number";
import { BarChart } from "@/components/system/bar-chart";
import { GlassPanel } from "@/components/system/glass-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, monthLabel } from "./format";
import { monthShort } from "@/lib/payouts";
import { ExpensePanel } from "./expense-panel";

const bpsText = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);
const signed = (c: number | null) => (c === null ? "—" : formatCents(c, { hideZeroCents: true }));

/** Monthly revenue, cleaner pay, ad spend, other costs, net profit and margin; owner/admin only. */
export function ProfitPanel({ snapshot, canEdit }: { snapshot: GrowthSnapshot; canEdit: boolean }) {
  const p = snapshot.profit;
  if (!p) {
    return (
      <GlassPanel as="section" className="p-5" data-testid="profit-panel">
        <p className="text-sm text-ink-muted">Profit includes what cleaners are paid, so only the owner or an admin sees it.</p>
      </GlassPanel>
    );
  }
  const m = p.thisMonth;
  // Newest month last; the chart shows the months of this year's plan and the recent past.
  const months = p.months.slice(-7);
  const tiles: [string, number, string][] = m
    ? [
        ["Revenue", m.revenueCents, "invoiced plus finished visits not yet invoiced"],
        ["Cleaner pay", -(m.subPayCents ?? 0), "pay on visits completed this month"],
        ["Ad spend", -m.adSpendCents, "entered by hand"],
        ["Other costs", -(m.otherCostsCents ?? 0), "expenses below"],
      ]
    : [];
  return (
    <div className="space-y-4" data-testid="profit-panel">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {tiles.map(([label, value, hint]) => (
          <GlassPanel key={label} as="div" className="kc-enter flex min-w-0 flex-col gap-1 p-4">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{label}</span>
            <span className="font-heading text-2xl font-medium text-ink tabular"><AnimatedNumber value={Math.round(value / 100) * 100} kind="cents" hideZeroCents /></span>
            <span className="text-[12px] text-ink-muted">{hint}</span>
          </GlassPanel>
        ))}
        <GlassPanel as="div" className="kc-enter flex min-w-0 flex-col gap-1 p-4" data-testid="profit-net">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Net profit</span>
          <span className="font-heading text-2xl font-medium text-ink tabular"><AnimatedNumber value={Math.round((m?.netProfitCents ?? 0) / 100) * 100} kind="cents" hideZeroCents /></span>
          <span className="text-[12px] text-ink-muted">{m ? monthLabel(m.monthStart) : ""}</span>
        </GlassPanel>
        <GlassPanel as="div" className="kc-enter flex min-w-0 flex-col gap-1 p-4" data-testid="profit-margin">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Margin</span>
          <span className="font-heading text-2xl font-medium text-ink tabular">{bpsText(m?.marginBps ?? null)}</span>
          <span className="text-[12px] text-ink-muted">net profit ÷ revenue</span>
        </GlassPanel>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <GlassPanel as="div" className="min-w-0 p-5 lg:col-span-2">
          <h3 className="mb-3 font-heading text-base font-medium text-ink">Net profit by month</h3>
          <BarChart
            values={months.map((x) => Math.max(0, x.netProfitCents ?? 0))}
            labels={months.map((x) => monthShort(x.monthStart))}
            format="dollars-short"
            ariaLabel={`Net profit by month: ${months.map((x) => `${monthLabel(x.monthStart)} ${signed(x.netProfitCents)}`).join(", ")}. Months at a loss show as empty bars.`}
            height={170}
          />
        </GlassPanel>
        <GlassPanel as="div" className="min-w-0 overflow-hidden lg:col-span-3">
          <Table stackOnMobile data-testid="profit-table">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cleaner pay</TableHead>
                <TableHead className="text-right">Ads</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="text-right">Net profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...months].reverse().map((x) => (
                <TableRow key={x.monthStart}>
                  <TableCell label="Month" className="font-medium text-ink">{monthLabel(x.monthStart)}</TableCell>
                  <TableCell label="Revenue" className="text-right tabular">{money(x.revenueCents)}</TableCell>
                  <TableCell label="Cleaner pay" className="text-right tabular">{money(x.subPayCents)}</TableCell>
                  <TableCell label="Ads" className="text-right tabular">{money(x.adSpendCents)}</TableCell>
                  <TableCell label="Other" className="text-right tabular">{money(x.otherCostsCents)}</TableCell>
                  <TableCell label="Net profit" className="text-right font-medium text-ink tabular">{signed(x.netProfitCents === null ? null : Math.round(x.netProfitCents / 100) * 100)}</TableCell>
                  <TableCell label="Margin" className="text-right tabular">{bpsText(x.marginBps)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </GlassPanel>
      </div>
      <ExpensePanel expenses={p.expenses} canEdit={canEdit} today={snapshot.today} />
    </div>
  );
}
