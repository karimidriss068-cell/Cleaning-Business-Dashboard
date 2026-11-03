import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Settings2, UserX } from "lucide-react";
import { GrowthBlock, GrowthStickyBar, type GrowthKpi } from "@/components/growth/growth-layout";
import { financeContext } from "@/lib/finance-auth";
import { loadGrowthSnapshot } from "@/lib/growth-data";
import { loadGrowthSettings } from "@/lib/growth-settings-load";
import { formatCents } from "@/lib/format";
import { budgetLabel, budgetTone, paceLabel, paceTone } from "@/lib/status";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/system/stat-tile";
import { EmptyState } from "@/components/system/empty-state";
import { GlassPanel } from "@/components/system/glass-panel";
import { BarChart } from "@/components/system/bar-chart";
import { AnimatedNumber } from "@/components/system/animated-number";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { GrowthCard } from "@/components/growth/growth-card";
import { ReplayDeck, ReplayProvider } from "@/components/vault/replay";
import { MoneyFlowPanel, RevenueByChannelPanel } from "@/components/vault/money-panels";
import { loadReplay, loadChannelStream } from "@/lib/vault/replay-data";
import { TiersPanel } from "@/components/growth/tiers-panel";
import { ProfitPanel } from "@/components/growth/profit-panel";
import { ForecastPanel } from "@/components/growth/forecast-panel";
import { DecisionLog, GatesPanel, HireTriggersPanel } from "@/components/growth/gates-panel";
import { FunnelPanel } from "@/components/growth/funnel-panel";
import { ChannelTestPanel } from "@/components/growth/channel-test-panel";
import { DemoDataPill } from "@/components/growth/demo-pill";
import { CapacityPanel, CashPanel, ScaleLightPanel } from "@/components/growth/scale-light-panel";
import { longDate, money, monthLabel, paceSentence } from "@/components/growth/format";
import { monthShort } from "@/lib/payouts";
import { DemoAnalytics } from "@/components/analytics/demo-analytics";

export const metadata: Metadata = { title: "Growth" };
export const dynamic = "force-dynamic";

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function GrowthPage() {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (ctx.role === "subcontractor") redirect("/my-jobs");
  if (!ctx.role) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">
        <div className="rounded-md border glass-card"><EmptyState icon={UserX} title="Your login isn't on the team yet">Ask the owner to add you.</EmptyState></div>
      </div>
    );
  }
  const snapshot = await loadGrowthSnapshot(ctx.supabase);
  const [replay, byChannel] = await Promise.all([loadReplay(ctx.supabase, snapshot.today, snapshot.goal.milestones), loadChannelStream(ctx.supabase, snapshot.today)]);
  const settings = await loadGrowthSettings(ctx.supabase);
  const canEdit = ctx.isAdmin;
  const { pace, ads, goal } = snapshot;
  const milestoneRows = goal.milestones;
  const cents = (c: number | null) => (c === null ? "—" : formatCents(c, { hideZeroCents: true }));

  const funnelTotal = snapshot.funnel.total.stages;
  const leadsN = funnelTotal.find((st) => st.key === "leads")?.count ?? 0;
  const bookedN = funnelTotal.find((st) => st.key === "booked")?.count ?? 0;
  const closePct = leadsN > 0 ? Math.round((bookedN / leadsN) * 100) : null;
  const profitMonths = snapshot.profit?.months ?? [];
  const thisProfit = snapshot.profit?.thisMonth ?? null;
  const kpis: GrowthKpi[] = [
    {
      label: "Revenue MTD",
      value: money(pace.revenueCents),
      hint: pace.phase === "before" ? "Plan not started" : `${paceLabel[pace.status]} · ${money(pace.expectedToDateCents)} expected`,
      tone: pace.phase === "before" ? "neutral" : pace.status === "behind" ? "warning" : "success",
      spark: milestoneRows.filter((m) => m.monthStart <= snapshot.today).map((m) => m.actualCents),
    },
    {
      label: "Profit MTD",
      value: thisProfit?.netProfitCents == null ? "—" : money(thisProfit.netProfitCents),
      hint: snapshot.profit ? (thisProfit?.marginBps == null ? "No revenue yet" : `${Math.round(thisProfit.marginBps / 100)}% margin`) : "Owner/admin only",
      tone: thisProfit?.netProfitCents == null ? "neutral" : thisProfit.netProfitCents >= 0 ? "success" : "danger",
      spark: profitMonths.map((m) => m.netProfitCents ?? 0),
    },
    { label: "Cost / booked client", value: cents(ads.costPerBookedCents), hint: `${ads.booked30} booked · 30d` },
    { label: "CAC payback", value: ads.paybackMonths === null ? "—" : `${ads.paybackMonths} mo`, hint: `${cents(ads.cacCents)} CAC (${ads.cacSource})` },
    { label: "Close rate", value: closePct === null ? "—" : `${closePct}%`, hint: `${bookedN} booked of ${leadsN} leads · ${snapshot.funnel.windowDays}d` },
    {
      label: "Cash runway",
      value: !snapshot.cash ? "—" : snapshot.cash.runwayMonths === null ? "Growing" : `${snapshot.cash.runwayMonths} mo`,
      hint: snapshot.cash ? `${money(snapshot.cash.onHandCents)} on hand` : "Owner/admin only",
      tone: !snapshot.cash ? "neutral" : snapshot.cash.status === "ok" ? "success" : snapshot.cash.status === "low" ? "warning" : "danger",
    },
  ];
  const lockedPanel = (title: string, why: string) => (
    <GlassPanel as="section" className="p-5"><h3 className="font-heading text-base font-medium text-ink">{title}</h3><p className="mt-2 text-sm text-ink-muted">{why}</p></GlassPanel>
  );

  return (
    <ReplayProvider frames={replay} includesDemo={snapshot.includesDemo}>
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 pb-6 md:px-6">
      <div className="pt-6">
        <PageHeader
          eyebrow="Business"
          title="Growth"
          description={`${money(goal.monthlyGoalCents)} a month by ${longDate(goal.deadline)}. Residential ${money(goal.residentialTargetCents)}, commercial ${money(goal.commercialTargetCents)}.`}
          actions={
            <div className="flex items-center gap-2">
              {snapshot.includesDemo ? <DemoDataPill /> : null}
              <Link href="/growth/settings" className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-raised">
                <Settings2 className="size-3.5" aria-hidden /> Growth settings
              </Link>
            </div>
          }
        />
      </div>

      <GrowthStickyBar kpis={kpis} />

      <GrowthBlock
        id="pace"
        title="Pace"
        info={`Month ${snapshot.tiers.planMonth === 0 ? "1 hasn't started" : `${snapshot.tiers.planMonth} of 12`} of the north star. Goal, tiers, forecast and monthly milestones.`}
        tabs={[
          { key: "goal", label: "This month", content: <div className="space-y-4"><GrowthCard snapshot={snapshot} index={1} /><ReplayDeck /></div> },
          { key: "milestones", label: "Milestones", content: <div className="space-y-3">
        <div className="grid gap-4 lg:grid-cols-5">
          <GlassPanel as="div" className="p-5 lg:col-span-2">
            <BarChart
              values={milestoneRows.map((m) => m.actualCents)}
              labels={milestoneRows.map((m) => monthShort(m.monthStart))}
              format="dollars-short"
              ariaLabel={`Revenue earned in each plan month: ${milestoneRows.map((m) => `${monthLabel(m.monthStart)} ${money(m.actualCents)}`).join(", ")}`}
              height={180}
            />
          </GlassPanel>
          <GlassPanel as="div" className="overflow-hidden lg:col-span-3">
            <ul className="divide-y divide-hairline" data-testid="milestone-list">
              {milestoneRows.map((m, i) => {
                const reached = m.actualCents >= m.targetCents && m.monthStart <= snapshot.today;
                const current = m.monthStart === pace.monthStart;
                return (
                  <li key={m.monthStart} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[8rem_1fr_auto]" data-current={current || undefined}>
                    <span className="text-sm font-medium text-ink">Month {i + 1} · {monthLabel(m.monthStart)}</span>
                    <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                      <Meter value={m.targetCents > 0 ? m.actualCents / m.targetCents : 0} tone={reached ? "success" : current ? paceTone[pace.status] : "neutral"} label={`${monthLabel(m.monthStart)}: ${money(m.actualCents)} of ${money(m.targetCents)}`} />
                    </span>
                    <span className="text-right text-[13px] text-ink-muted tabular">
                      {money(m.actualCents)} of {money(m.targetCents)}
                      {reached && <span className="ml-2 font-medium text-success">Hit</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </GlassPanel>
        </div>
        <p className="text-[13px] text-ink-muted">
          {pace.phase === "before"
            ? `The plan starts ${longDate(goal.startDate)}, in ${pace.daysUntilStart} days.`
            : `${monthLabel(pace.monthStart)}: ${paceSentence(pace.daysAhead).toLowerCase()}. Expected by today ${money(pace.expectedToDateCents)}, projected month end ${money(pace.projectedCents)}.`}{" "}
          {pace.phase !== "before" && <StatusPill tone={paceTone[pace.status]}>{paceLabel[pace.status]}</StatusPill>}
        </p>
        </div> },
          { key: "north", label: "North star", content: <TiersPanel snapshot={snapshot} /> },
          { key: "forecast", label: "What each tier takes", content: <ForecastPanel snapshot={snapshot} /> },
        ]}
      />

      <GrowthBlock
        id="money"
        title="Money"
        info="Revenue by channel, where this month's money went, and profit by New York month."
        tabs={[
          { key: "flow", label: "Overview", content: (
            <div className="grid gap-4 xl:grid-cols-2">
              <RevenueByChannelPanel data={byChannel} index={2} />
              {thisProfit ? <MoneyFlowPanel month={thisProfit} index={2} /> : lockedPanel("Money flow", "Profit includes cleaner pay, so only the owner or an admin sees it.")}
            </div>
          ) },
          { key: "profit", label: "Profit by month", content: <ProfitPanel snapshot={snapshot} canEdit={canEdit} /> },
        ]}
      />

      <GrowthBlock
        id="acquisition"
        title="Acquisition"
        info="Meta ad spend is typed in by hand; nothing connects to Meta yet. Channel test recommends, you decide."
        actions={canEdit ? <Link href="/growth/settings#ad-spend" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"><Plus className="size-3.5" aria-hidden /> Add spend</Link> : undefined}
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="ad-tiles">
          <StatTile label="Cost per lead" value={cents(ads.costPerLeadCents)} hint={`${ads.leads30} lead${ads.leads30 === 1 ? "" : "s"} · 30d`} index={4} />
          <StatTile label="Cost per booked client" value={cents(ads.costPerBookedCents)} hint={`${ads.booked30} booked · 30d`} index={5} />
          <StatTile label="CAC payback" value={ads.paybackMonths === null ? "—" : `${ads.paybackMonths} mo`} hint={`${cents(ads.cacCents)} per client, ${settings.marginBps / 100}% margin`} index={6} />
          <GlassPanel as="div" className="kc-enter flex flex-col gap-2 p-5" style={stagger(7)} data-testid="budget-tile">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Spend vs budget</span>
            <span className="font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular text-glow">
              <AnimatedNumber value={Math.round(ads.spendMonthCents / 100) * 100} kind="cents" hideZeroCents />
            </span>
            <Meter value={ads.budgetCents > 0 ? ads.spendMonthCents / ads.budgetCents : ads.spendMonthCents > 0 ? 1 : 0} marker={undefined} tone={budgetTone[ads.budgetStatus]} label="Ad spend this month against the monthly budget" />
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
              <StatusPill tone={budgetTone[ads.budgetStatus]}>{budgetLabel[ads.budgetStatus]}</StatusPill>
              <span className="tabular">{ads.budgetUsedPercent}% of {money(ads.budgetCents)}</span>
            </div>
          </GlassPanel>
        </div>
        <details className="group rounded-md border border-hairline glass-card">
          <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-ink">Channel test: channels side by side against your rules</summary>
          <div className="border-t border-hairline p-4"><ChannelTestPanel snapshot={snapshot} canEdit={canEdit} /></div>
        </details>
      </GrowthBlock>

      <GrowthBlock id="funnel" title="Funnel" info="Where leads come from and how far they get, with reply time and churn.">
        <FunnelPanel snapshot={snapshot} />
      </GrowthBlock>

      <GrowthBlock
        id="operations"
        title="Operations"
        info="Capacity, cash and the scale light, then the go/no-go gates and hire triggers."
        tabs={[
          { key: "status", label: "Status", content: (
            <div className="grid gap-4 lg:grid-cols-3">
              <CapacityPanel capacity={snapshot.capacity} />
              {snapshot.cash ? <CashPanel cash={snapshot.cash} /> : lockedPanel("Cash and runway", "Cash includes payouts, so only the owner or an admin sees it.")}
              {snapshot.scaleLight ? <ScaleLightPanel light={snapshot.scaleLight} /> : lockedPanel("Can I scale spend?", "This light depends on cash, so only the owner or an admin sees it.")}
            </div>
          ) },
          { key: "gates", label: "Gates", content: <GatesPanel gates={snapshot.gates} canEdit={canEdit} /> },
          { key: "hire", label: "Hire triggers", content: <HireTriggersPanel triggers={snapshot.hireTriggers} canEdit={canEdit} /> },
          { key: "log", label: "Decision log", content: <DecisionLog decisions={snapshot.decisions} canEdit={canEdit} today={snapshot.today} /> },
        ]}
      />

      <details className="rounded-md border border-hairline glass-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-ink">More growth analytics (sample)</summary>
        <div className="border-t border-hairline p-4"><DemoAnalytics pack="growth" /></div>
      </details>
    </div>
    </ReplayProvider>
  );
}
