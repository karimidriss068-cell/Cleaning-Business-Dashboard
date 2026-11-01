"use client";

import { useState } from "react";
import { formatCents } from "@/lib/format";
import { monthShort } from "@/lib/payouts";
import type { FunnelView } from "@/lib/growth-channels";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatTile } from "@/components/system/stat-tile";
import { StatusPill } from "@/components/system/status-pill";
import { cn } from "@/lib/utils";

const cents = (c: number | null) => (c === null ? "—" : formatCents(c, { hideZeroCents: true }));
type View = "channels" | "campaigns" | "creatives";
const VIEWS: { key: View; label: string }[] = [
  { key: "channels", label: "By channel" },
  { key: "campaigns", label: "By campaign" },
  { key: "creatives", label: "By creative" },
];

/**
 * Leads to contacted to quote sent to booked to first clean done to recurring,
 * per channel, campaign and creative, with each step's conversion and cost.
 * Counts are the leads of the last 90 days against the ad spend of the same days.
 */
export function FunnelPanel({ snapshot }: { snapshot: GrowthSnapshot }) {
  const [view, setView] = useState<View>("channels");
  const { funnel, replyBuckets, churn } = snapshot;
  const rows: FunnelView[] = funnel[view];
  const t = funnel.total;
  return (
    <div className="space-y-4" data-testid="funnel-panel">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Cost per booked client" value={cents(t.costPerBookedCents)} hint={`${t.stages[3].count} booked · ${cents(t.spendCents)} spent, last ${funnel.windowDays} days`} index={0} />
        <StatTile label="Cost per recurring client" value={cents(t.costPerRecurringCents)} hint={`${t.stages[5].count} became recurring`} index={1} />
        <StatTile label="Lead to recurring" value={t.stages[5].fromLeadsPercent === null ? "—" : `${t.stages[5].fromLeadsPercent}%`} hint={`${t.stages[0].count} leads in the window`} index={2} />
      </div>

      <GlassPanel as="div" className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
          <div>
            <h3 className="font-heading text-base font-medium text-ink">Funnel</h3>
            <p className="text-[13px] text-ink-muted">Each step shows how many, the share of the step before, and the cost per person at that step.</p>
          </div>
          <div role="radiogroup" aria-label="Group the funnel" className="flex gap-1.5">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" role="radio" aria-checked={view === v.key} onClick={() => setView(v.key)} data-testid={`funnel-view-${v.key}`} className={cn("h-11 rounded-sm border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8", view === v.key ? "border-brand bg-highlight text-ink" : "border-hairline text-ink-muted")}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-muted">{view === "creatives" ? "No creative is tagged yet. Name the creative when you enter ad spend, and on the lead." : "Nothing in the last 90 days."}</p>
        ) : (
          <Table stackOnMobile data-testid="funnel-table">
            <TableHeader>
              <TableRow>
                <TableHead>{view === "channels" ? "Channel" : view === "campaigns" ? "Campaign" : "Creative"}</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                {t.stages.map((s) => <TableHead key={s.key} className="text-right">{s.label}</TableHead>)}
                <TableHead className="text-right">Per booked</TableHead>
                <TableHead className="text-right">Per recurring</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.channel}-${r.key}`} data-testid={`funnel-row-${r.key}`}>
                  <TableCell label={view === "channels" ? "Channel" : view === "campaigns" ? "Campaign" : "Creative"}>
                    <div className="min-w-0 max-md:text-right">
                      <div className="flex flex-wrap items-center gap-2 max-md:justify-end">
                        <span className="font-medium text-ink">{r.name}</span>
                        {r.isDemo && <StatusPill tone="warning">Demo</StatusPill>}
                      </div>
                      {view !== "channels" && r.channel && <div className="text-[12px] text-ink-muted">{r.channel.replace("_", " ")}</div>}
                    </div>
                  </TableCell>
                  <TableCell label="Spend" className="text-right tabular">{cents(r.spendCents)}</TableCell>
                  {r.stages.map((s) => (
                    <TableCell key={s.key} label={s.label} className="text-right tabular">
                      <div>
                        <div className="text-ink">{s.count}</div>
                        {s.key !== "leads" && (
                          <div className="text-[11px] text-ink-muted">{s.fromPreviousPercent === null ? "—" : `${s.fromPreviousPercent}%`} · {cents(s.costCents)}</div>
                        )}
                      </div>
                    </TableCell>
                  ))}
                  <TableCell label="Per booked" className="text-right font-medium text-ink tabular">{cents(r.costPerBookedCents)}</TableCell>
                  <TableCell label="Per recurring" className="text-right font-medium text-ink tabular">{cents(r.costPerRecurringCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GlassPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel as="section" aria-labelledby="reply-buckets" className="min-w-0 space-y-3 p-5" data-testid="reply-buckets">
          <div>
            <h3 id="reply-buckets" className="font-heading text-base font-medium text-ink">Reply time and booking rate</h3>
            <p className="text-[13px] text-ink-muted">How fast the first reply went out, and how many of those leads booked. {replyBuckets.unanswered} lead{replyBuckets.unanswered === 1 ? "" : "s"} not answered yet.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {replyBuckets.buckets.map((b) => (
              <div key={b.key} className="rounded-md border border-hairline p-3" data-testid={`reply-${b.key}`}>
                <p className="text-[12px] text-ink-muted">{b.label}</p>
                <p className="font-heading text-2xl font-medium text-ink tabular">
                  {b.bookingRatePercent === null ? "—" : <AnimatedNumber value={b.bookingRatePercent} kind="percent" />}
                </p>
                <p className="text-[12px] text-ink-muted tabular">{b.booked} of {b.leads} booked</p>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel as="section" aria-labelledby="churn" className="min-w-0 space-y-3 p-5" data-testid="churn-tracker">
          <div>
            <h3 id="churn" className="font-heading text-base font-medium text-ink">Monthly churn</h3>
            <p className="text-[13px] text-ink-muted">Residential cancellations ÷ recurring clients at the start of the month. Your forecast assumes {(churn.assumedBps / 100).toFixed(1)}%.</p>
          </div>
          <Table stackOnMobile>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">At start</TableHead>
                <TableHead className="text-right">Cancelled</TableHead>
                <TableHead className="text-right">Churn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...churn.months].reverse().map((m) => (
                <TableRow key={m.monthStart}>
                  <TableCell label="Month" className="font-medium text-ink">{monthShort(m.monthStart)} {m.monthStart.slice(0, 4)}</TableCell>
                  <TableCell label="At start" className="text-right tabular">{m.startRecurring}</TableCell>
                  <TableCell label="Cancelled" className="text-right tabular">{m.cancellations}</TableCell>
                  <TableCell label="Churn" className="text-right tabular">{m.rateBps === null ? "—" : `${(m.rateBps / 100).toFixed(1)}%`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[13px] text-ink-muted tabular" data-testid="churn-average">
            Average over these months: {churn.averageBps === null ? "no recurring clients yet" : `${(churn.averageBps / 100).toFixed(1)}%`}
            {churn.averageBps !== null && churn.averageBps > churn.assumedBps ? ", above your forecast assumption." : "."}
          </p>
        </GlassPanel>
      </div>
    </div>
  );
}
