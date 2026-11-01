import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Lock, UserX, Wallet } from "lucide-react";
import { financeContext } from "@/lib/finance-auth";
import { load1099, loadCandidates, loadFinanceMonths, loadPayoutsForWeek, loadSettings } from "@/lib/finance-data";
import { formatNyDate, nyToday, nyWeekStart } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/system/stat-tile";
import { EmptyState } from "@/components/system/empty-state";
import { GlassPanel } from "@/components/system/glass-panel";
import { PayoutCard } from "@/components/payouts/payout-card";
import { WeekBar } from "@/components/payouts/week-bar";
import { ExcludedVisits } from "@/components/payouts/excluded-visits";
import { Contractors1099 } from "@/components/payouts/contractor-1099";

export const metadata: Metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ week?: string; year?: string }> }) {
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
  if (!ctx.isAdmin) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">
        <div className="rounded-md border glass-card"><EmptyState icon={Lock} title="Payouts are for the owner and admins">Subcontractor pay and 1099 records aren&apos;t visible to staff.</EmptyState></div>
      </div>
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const today = nyToday(now);
  const currentWeek = nyWeekStart(today);
  const week = sp.week && DAY.test(sp.week) ? nyWeekStart(sp.week) : currentWeek;
  const thisYear = Number(today.slice(0, 4));
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : thisYear;

  const [payouts, candidates, settings, contractors, approvedRes, months] = await Promise.all([
    loadPayoutsForWeek(ctx.supabase, week),
    loadCandidates(ctx.supabase, week),
    loadSettings(ctx.supabase),
    load1099(ctx.supabase, year),
    ctx.supabase.from("payouts").select("total_cents").eq("status", "approved"),
    loadFinanceMonths(ctx.supabase, 1),
  ]);
  if (approvedRes.error) throw new Error(`Loading approved payouts failed: ${approvedRes.error.message}`);

  const approvedOwed = (approvedRes.data ?? []).reduce((s, p) => s + p.total_cents, 0);
  const live = payouts.filter((p) => p.status !== "void");
  const draftTotal = live.filter((p) => p.status === "draft").reduce((s, p) => s + p.totalCents, 0);
  const excluded = candidates.filter((c) => c.reason !== null);
  const readyUnbuilt = candidates.filter((c) => c.reason === null && c.payoutId === null).length;
  const paidThisMonth = months.at(-1)?.payoutsCents ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow={`Business · ${formatNyDate(now, "weekday")}`}
        title="Payouts"
        description="Weekly batches from completed visits, only once the customer's money is in. You pay by Zelle, ACH or check yourself, then record it here."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Approved, to pay" figure={{ value: approvedOwed, kind: "cents", hideZeroCents: true }} hint="frozen, waiting for you to pay" index={1} />
        <StatTile label="Drafts this week" figure={{ value: draftTotal, kind: "cents", hideZeroCents: true }} hint={`${live.filter((p) => p.status === "draft").length} to review`} index={2} />
        <StatTile label="Paid this month" figure={{ value: paidThisMonth, kind: "cents", hideZeroCents: true }} hint="batches marked paid" index={3} />
        <StatTile label="Not payable yet" figure={{ value: excluded.length, kind: "count" }} hint="visits waiting on collection" index={4} />
      </div>

      <GlassPanel as="section" aria-label="This week's payouts" className="space-y-4 p-5">
        <WeekBar weekStart={week} currentWeek={currentWeek} readyVisits={readyUnbuilt} />
        {live.length === 0 ? (
          <EmptyState icon={Wallet} title="No payouts for this week yet">
            {readyUnbuilt > 0 ? `${readyUnbuilt} visit${readyUnbuilt === 1 ? " is" : "s are"} ready. Build payouts to group them by subcontractor.` : "Visits become payable once their invoice is paid or marked collected."}
          </EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {live.map((p, i) => (
              <PayoutCard key={p.id} payout={p} today={today} index={i + 1} />
            ))}
          </div>
        )}
        {payouts.some((p) => p.status === "void") && (
          <p className="text-[13px] text-ink-muted">{payouts.filter((p) => p.status === "void").length} voided payout(s) this week are kept for the record.</p>
        )}
      </GlassPanel>

      <ExcludedVisits rows={excluded} />

      <Contractors1099 rows={contractors} year={year} thresholdCents={settings.thresholdCents} warnBps={settings.warnBps} />
    </div>
  );
}
