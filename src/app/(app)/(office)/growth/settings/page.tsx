import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { loadGrowthSnapshot } from "@/lib/growth-data";
import { loadGrowthSettings } from "@/lib/growth-settings-load";
import { PageHeader } from "@/components/shell/page-header";
import { GlassPanel } from "@/components/system/glass-panel";
import { AdSpendPanel } from "@/components/growth/ad-spend-panel";
import { AssumptionsForm, CashForm, PlanForm } from "@/components/growth/growth-forms";
import { ForecastForm, TierForm } from "@/components/growth/north-forms";

export const metadata: Metadata = { title: "Growth settings" };
export const dynamic = "force-dynamic";

function Block({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 space-y-3">
      <div>
        <h2 id={`${id}-h`} className="font-heading text-lg font-medium text-ink">{title}</h2>
        <p className="text-[13px] text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Everything editable behind /growth: ad spend entry, plan, assumptions, tiers and cash. */
export default async function GrowthSettingsPage() {
  const ctx = await financeContext();
  if (!ctx) redirect("/login");
  if (ctx.role === "subcontractor") redirect("/my-jobs");
  if (!ctx.role) redirect("/growth");
  const snapshot = await loadGrowthSnapshot(ctx.supabase);
  const settings = await loadGrowthSettings(ctx.supabase);
  const canEdit = ctx.isAdmin;
  const milestoneRows = snapshot.goal.milestones;
  const extra = snapshot.settingsExtra;
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Growth"
        title="Growth settings"
        description="Ad spend, plan, assumptions, tiers and cash. Changes update the Growth page for everyone."
        actions={<Link href="/growth" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-text hover:underline"><ArrowLeft className="size-3.5" aria-hidden /> Back to Growth</Link>}
      />
      <nav aria-label="Settings sections" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-brand-text">
        <a href="#ad-spend">Ad spend</a><a href="#plan">Plan</a><a href="#assumptions">Assumptions</a><a href="#tiers-settings">Tiers and forecast</a>{ctx.isAdmin && <a href="#cash-settings">Cash</a>}
      </nav>
      <Block id="ad-spend" title="Ad spend" description="Typed in by hand. Nothing here connects to Meta or any ad platform.">
        <AdSpendPanel ads={snapshot.ads} today={snapshot.today} canEdit={canEdit} />
      </Block>
      <Block id="plan" title="Plan and milestones" description="The goal, when it starts, and what each month should reach.">
        <GlassPanel as="div" className="p-5 md:p-6">
          <PlanForm key={`${settings.startDate}-${milestoneRows.map((m) => m.targetCents).join("-")}`} settings={settings} milestones={milestoneRows.map((m) => m.targetCents)} canEdit={canEdit} />
        </GlassPanel>
      </Block>
      <Block id="assumptions" title="Assumptions" description="Change these and the accounts and leads the plan needs update.">
        <GlassPanel as="div" className="p-5 md:p-6"><AssumptionsForm key={JSON.stringify(settings)} settings={settings} canEdit={canEdit} /></GlassPanel>
      </Block>
      <Block id="tiers-settings" title="Tiers and forecast" description="Which tier to track, the three targets, and the churn and crew assumptions behind the forecast.">
        <GlassPanel as="div" className="space-y-6 p-5 md:p-6">
          <TierForm key={JSON.stringify([extra.tier, extra.tierBaseRevenueCents, extra.tierStrongRevenueCents, extra.tierNorthProfitCents])} extra={extra} canEdit={canEdit} />
          <hr className="border-hairline" />
          <ForecastForm key={`${extra.monthlyChurnBps}-${extra.cleansPerCrewPerWeek}`} extra={extra} canEdit={canEdit} />
        </GlassPanel>
      </Block>
      {ctx.isAdmin && (
        <Block id="cash-settings" title="Cash settings" description="Starting capital, fixed costs and the minimum buffer behind the cash and scale-light numbers.">
          <GlassPanel as="div" className="p-5 md:p-6">
            <CashForm key={`${settings.startingCapitalCents}-${settings.cashStartDate}-${settings.monthlyFixedCostsCents}-${settings.minBufferCents}`} settings={settings} canEdit />
          </GlassPanel>
        </Block>
      )}
    </div>
  );
}
