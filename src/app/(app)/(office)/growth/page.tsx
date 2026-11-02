import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserX } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { loadGrowthSnapshot } from "@/lib/growth-data";
import { growthSettingsSchema } from "@/lib/schemas/growth";
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
import { loadReplay, loadRevenueByChannel } from "@/lib/vault/replay-data";
import { TiersPanel } from "@/components/growth/tiers-panel";
import { ProfitPanel } from "@/components/growth/profit-panel";
import { ForecastPanel } from "@/components/growth/forecast-panel";
import { DecisionLog, GatesPanel, HireTriggersPanel } from "@/components/growth/gates-panel";
import { FunnelPanel } from "@/components/growth/funnel-panel";
import { ChannelTestPanel } from "@/components/growth/channel-test-panel";
import { ForecastForm, TierForm } from "@/components/growth/north-forms";
import { DemoDataPill } from "@/components/growth/demo-pill";
import { AdSpendPanel } from "@/components/growth/ad-spend-panel";
import { AssumptionsForm, CashForm, PlanForm } from "@/components/growth/growth-forms";
import { CapacityPanel, CashPanel, ScaleLightPanel } from "@/components/growth/scale-light-panel";
import { longDate, money, monthLabel, paceSentence } from "@/components/growth/format";
import { monthShort } from "@/lib/payouts";

export const metadata: Metadata = { title: "Growth" };
export const dynamic = "force-dynamic";

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

function Section({ id, title, description, children, index }: { id: string; title: string; description?: string; children: React.ReactNode; index: number }) {
  return (
    <section aria-labelledby={id} className="space-y-3 kc-enter" style={stagger(index)}>
      <div>
        <h2 id={id} className="font-heading text-lg font-medium text-ink">{title}</h2>
        {description && <p className="text-[13px] text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

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
  const [replay, byChannel] = await Promise.all([loadReplay(ctx.supabase, snapshot.today, snapshot.goal.milestones), loadRevenueByChannel(ctx.supabase)]);
  const { data: settingsRow, error } = await ctx.supabase.from("growth_settings").select("*").single();
  if (error) throw new Error(`Loading growth settings failed: ${error.message}`);
  const settings = growthSettingsSchema.parse({
    startDate: settingsRow.start_date,
    residentialTargetCents: settingsRow.residential_target_cents,
    commercialTargetCents: settingsRow.commercial_target_cents,
    resVisitPriceCents: settingsRow.res_visit_price_cents,
    resVisitsPerMonth: settingsRow.res_visits_per_month,
    commAccountValueCents: settingsRow.comm_account_value_cents,
    closeRateBps: settingsRow.close_rate_bps,
    cacCents: settingsRow.cac_cents,
    marginBps: settingsRow.margin_bps,
    monthlyAdBudgetCents: settingsRow.monthly_ad_budget_cents,
    replyTargetMinutes: settingsRow.reply_target_minutes,
    cleansPerCleanerPerWeek: settingsRow.cleans_per_cleaner_per_week,
    startingCapitalCents: settingsRow.starting_capital_cents,
    cashStartDate: settingsRow.cash_start_date,
    monthlyFixedCostsCents: settingsRow.monthly_fixed_costs_cents,
    minBufferCents: settingsRow.min_buffer_cents,
  });
  const canEdit = ctx.isAdmin;
  const { pace, ads, goal } = snapshot;
  const milestoneRows = goal.milestones;
  const cents = (c: number | null) => (c === null ? "—" : formatCents(c, { hideZeroCents: true }));

  return (
    <ReplayProvider frames={replay} includesDemo={snapshot.includesDemo}>
    <div className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Business"
        title="Growth"
        description={`${money(goal.monthlyGoalCents)} a month by ${longDate(goal.deadline)}. Residential ${money(goal.residentialTargetCents)}, commercial ${money(goal.commercialTargetCents)}.`}
        actions={snapshot.includesDemo ? <DemoDataPill /> : undefined}
      />

      <ReplayDeck description="Drag across the last 30 days to watch revenue, leads and the pace status change with the day." />

      <GrowthCard snapshot={snapshot} index={1} />

      <div className="grid gap-6 xl:grid-cols-2">
        <RevenueByChannelPanel data={byChannel} index={2} />
        {snapshot.profit?.thisMonth ? <MoneyFlowPanel month={snapshot.profit.thisMonth} index={2} /> : null}
      </div>

      <Section id="north-star" title="North star: 12 months" description={`Pace against the ${snapshot.tiers.selected === "north_star" ? "north star" : snapshot.tiers.selected} tier, with the others beside it. Month ${snapshot.tiers.planMonth === 0 ? "1 hasn't started" : `${snapshot.tiers.planMonth} of 12`}.`} index={2}>
        <TiersPanel snapshot={snapshot} />
      </Section>

      <Section id="profit" title="Profit" description="Revenue minus cleaner pay, ad spend and other costs, by New York month." index={2}>
        <ProfitPanel snapshot={snapshot} canEdit={canEdit} />
      </Section>

      <Section id="forecast" title="What each tier takes" description="Revenue, clients, cleans a week, crews and ad budget needed by month 12, with churn replaced." index={2}>
        <ForecastPanel snapshot={snapshot} />
      </Section>

      <Section id="gates" title="Go/no-go gates" description="Checkpoints at day 30 and months 3, 6, 9 and 12, judged from real data." index={2}>
        <GatesPanel gates={snapshot.gates} canEdit={canEdit} />
        <HireTriggersPanel triggers={snapshot.hireTriggers} canEdit={canEdit} />
        <DecisionLog decisions={snapshot.decisions} canEdit={canEdit} today={snapshot.today} />
      </Section>

      <Section id="milestones" title="Monthly milestones" description="Revenue earned each plan month (invoiced, plus completed visits not yet invoiced) against its milestone." index={2}>
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
      </Section>

      <Section id="ads" title="Meta ads" description="Typed in by hand for now. Nothing here connects to Meta or any ad platform." index={3}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="ad-tiles">
          <StatTile label="Cost per lead" value={cents(ads.costPerLeadCents)} hint={`${ads.leads30} lead${ads.leads30 === 1 ? "" : "s"} from ads, last 30 days`} index={4} />
          <StatTile label="Cost per booked client" value={cents(ads.costPerBookedCents)} hint={`${ads.booked30} booked, last 30 days`} index={5} />
          <StatTile
            label="CAC payback"
            value={ads.paybackMonths === null ? "—" : `${ads.paybackMonths} mo`}
            hint={`${cents(ads.cacCents)} per client (${ads.cacSource}), ${cents(ads.avgMonthlyClientValueCents)} a month at ${settings.marginBps / 100}% margin`}
            index={6}
          />
          <GlassPanel as="div" className="kc-enter flex flex-col gap-2 p-5" style={stagger(7)} data-testid="budget-tile">
            <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Spend vs budget</span>
            <span className="font-heading text-[40px] leading-[44px] font-medium tracking-[-0.02em] text-ink tabular text-glow">
              <AnimatedNumber value={Math.round(ads.spendMonthCents / 100) * 100} kind="cents" hideZeroCents />
            </span>
            <Meter value={ads.budgetCents > 0 ? ads.spendMonthCents / ads.budgetCents : ads.spendMonthCents > 0 ? 1 : 0} marker={undefined} tone={budgetTone[ads.budgetStatus]} label="Ad spend this month against the monthly budget" />
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <StatusPill tone={budgetTone[ads.budgetStatus]}>{budgetLabel[ads.budgetStatus]}</StatusPill>
              <span className="tabular">{ads.budgetUsedPercent}% of {money(ads.budgetCents)} this month</span>
            </div>
          </GlassPanel>
        </div>
        <AdSpendPanel ads={ads} today={snapshot.today} canEdit={canEdit} />
      </Section>

      <Section id="funnel" title="Channels and funnel" description="Where leads come from and how far they get, with reply time and churn." index={7}>
        <FunnelPanel snapshot={snapshot} />
      </Section>

      <Section id="channel-test" title="Channel test" description="Channels side by side against your rules. It recommends; you decide." index={7}>
        <ChannelTestPanel snapshot={snapshot} canEdit={canEdit} />
      </Section>

      <Section id="operations" title="Capacity, cash and the scale light" index={8}>
        <div className="grid gap-4 lg:grid-cols-2">
          <CapacityPanel capacity={snapshot.capacity} />
          {snapshot.cash ? (
            <CashPanel cash={snapshot.cash} />
          ) : (
            <GlassPanel as="section" className="p-5"><h3 className="font-heading text-base font-medium text-ink">Cash and runway</h3><p className="mt-2 text-sm text-ink-muted">Cash includes payouts, so only the owner or an admin sees it.</p></GlassPanel>
          )}
        </div>
        {snapshot.scaleLight ? (
          <ScaleLightPanel light={snapshot.scaleLight} />
        ) : (
          <GlassPanel as="section" className="p-5"><h3 className="font-heading text-base font-medium text-ink">Can I scale spend?</h3><p className="mt-2 text-sm text-ink-muted">This light depends on cash, so only the owner or an admin sees it.</p></GlassPanel>
        )}
      </Section>

      <Section id="plan" title="Plan and milestones" description="The goal, when it starts, and what each month should reach." index={9}>
        <GlassPanel as="div" className="p-5 md:p-6">
          <PlanForm key={`${settings.startDate}-${milestoneRows.map((m) => m.targetCents).join("-")}`} settings={settings} milestones={milestoneRows.map((m) => m.targetCents)} canEdit={canEdit} />
        </GlassPanel>
      </Section>

      <Section id="assumptions" title="Assumptions" description="Change these and the accounts and leads the plan needs update. Saved for everyone." index={10}>
        <GlassPanel as="div" className="p-5 md:p-6">
          <AssumptionsForm key={JSON.stringify(settings)} settings={settings} canEdit={canEdit} />
        </GlassPanel>
      </Section>

      <Section id="tiers-settings" title="Tiers and forecast" description="Which tier to track, the three targets, and the churn and crew assumptions behind the forecast." index={10}>
        <GlassPanel as="div" className="space-y-6 p-5 md:p-6">
          <TierForm key={JSON.stringify([snapshot.settingsExtra.tier, snapshot.settingsExtra.tierBaseRevenueCents, snapshot.settingsExtra.tierStrongRevenueCents, snapshot.settingsExtra.tierNorthProfitCents])} extra={snapshot.settingsExtra} canEdit={canEdit} />
          <hr className="border-hairline" />
          <ForecastForm key={`${snapshot.settingsExtra.monthlyChurnBps}-${snapshot.settingsExtra.cleansPerCrewPerWeek}`} extra={snapshot.settingsExtra} canEdit={canEdit} />
        </GlassPanel>
      </Section>

      {ctx.isAdmin && (
        <Section id="cash-settings" title="Cash settings" description="Starting capital, fixed costs and the minimum buffer behind the cash and scale-light numbers." index={11}>
          <GlassPanel as="div" className="p-5 md:p-6">
            <CashForm key={`${settings.startingCapitalCents}-${settings.cashStartDate}-${settings.monthlyFixedCostsCents}-${settings.minBufferCents}`} settings={settings} canEdit />
          </GlassPanel>
        </Section>
      )}
    </div>
    </ReplayProvider>
  );
}
