import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentWeekRange } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

type Ctx = {
  activeCampaigns: number;
  spend: number;
  leads: number;
  appts: number;
};

const emptyCtx = (): Ctx => ({
  activeCampaigns: 0,
  spend: 0,
  leads: 0,
  appts: 0,
});

const DAY = 86400000;
const WEEKS_OF_HISTORY = 8;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Monday 00:00 (as an ISO date) of the week containing `dateStr`. */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return isoDate(d);
}

function weekLabel(mondayIso: string): string {
  const d = new Date(`${mondayIso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { weekStart } = currentWeekRange();

  const historyStart = isoDate(new Date(Date.now() - WEEKS_OF_HISTORY * 7 * DAY));
  const trendStart = isoDate(new Date(Date.now() - 30 * DAY));

  const [{ data: accounts }, { data: campaigns }] = await Promise.all([
    supabase.from("accounts").select("id, type"),
    supabase.from("campaigns").select("id, account_id, status"),
  ]);

  const accountType = new Map((accounts ?? []).map((a) => [a.id, a.type]));
  const campaignType = new Map(
    (campaigns ?? []).map((c) => [c.id, accountType.get(c.account_id)]),
  );

  const [{ data: spendHistory }, { data: leads }, { data: apptHistory }] =
    await Promise.all([
      supabase
        .from("spend_daily")
        .select("campaign_id, date, spend")
        .gte("date", historyStart),
      supabase.from("leads").select("campaign_id").gte("created_at", weekStart),
      supabase
        .from("appointments")
        .select("account_id, booked_at")
        .gte("booked_at", historyStart),
    ]);

  // ---- This week KPIs, split by account type --------------------------
  const stats: Record<"internal" | "client", Ctx> = {
    internal: emptyCtx(),
    client: emptyCtx(),
  };

  for (const c of campaigns ?? []) {
    const t = accountType.get(c.account_id);
    if (t && c.status === "active") stats[t].activeCampaigns++;
  }
  for (const s of spendHistory ?? []) {
    if (s.date < weekStart) continue;
    const t = campaignType.get(s.campaign_id);
    if (t) stats[t].spend += Number(s.spend ?? 0);
  }
  for (const l of leads ?? []) {
    const t = l.campaign_id ? campaignType.get(l.campaign_id) : undefined;
    if (t) stats[t].leads++;
  }
  for (const a of apptHistory ?? []) {
    if (a.booked_at < weekStart) continue;
    const t = accountType.get(a.account_id);
    if (t) stats[t].appts++;
  }

  const totalSpendWeek = stats.internal.spend + stats.client.spend;
  const totalApptsWeek = stats.internal.appts + stats.client.appts;
  const combinedCpa = totalApptsWeek > 0 ? totalSpendWeek / totalApptsWeek : null;
  const internalCpa = stats.internal.appts > 0 ? stats.internal.spend / stats.internal.appts : null;
  const clientCpa = stats.client.appts > 0 ? stats.client.spend / stats.client.appts : null;

  // ---- Spend trend (last 30 days, daily, combined) ---------------------
  const spendByDate = new Map<string, number>();
  for (const s of spendHistory ?? []) {
    if (s.date < trendStart) continue;
    if (!campaignType.get(s.campaign_id)) continue;
    spendByDate.set(s.date, (spendByDate.get(s.date) ?? 0) + Number(s.spend ?? 0));
  }
  const spendTrend: { date: string; spend: number }[] = [];
  for (let i = 30; i >= 0; i--) {
    const date = isoDate(new Date(Date.now() - i * DAY));
    spendTrend.push({
      date: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      spend: Math.round((spendByDate.get(date) ?? 0) * 100) / 100,
    });
  }
  // Cheap "is this page alive" pulse behind the CPA hero — recent daily spend,
  // not a literal daily CPA (appointment counts are too sparse per-day to
  // produce a meaningful daily ratio at this volume).
  const cpaSparkline = spendTrend.slice(-14).map((p) => ({ date: p.date, value: p.spend }));

  // ---- CPA trend (last 8 weeks, combined) ------------------------------
  const weekBuckets: Record<string, { spend: number; appts: number }> = {};
  for (const s of spendHistory ?? []) {
    if (!campaignType.get(s.campaign_id)) continue;
    const wk = mondayOf(s.date);
    weekBuckets[wk] ??= { spend: 0, appts: 0 };
    weekBuckets[wk].spend += Number(s.spend ?? 0);
  }
  for (const a of apptHistory ?? []) {
    if (!accountType.get(a.account_id)) continue;
    const wk = mondayOf(a.booked_at.slice(0, 10));
    weekBuckets[wk] ??= { spend: 0, appts: 0 };
    weekBuckets[wk].appts += 1;
  }
  const cpaTrend: { period: string; cpa: number | null }[] = [];
  for (let i = WEEKS_OF_HISTORY - 1; i >= 0; i--) {
    const wk = mondayOf(isoDate(new Date(Date.now() - i * 7 * DAY)));
    const bucket = weekBuckets[wk];
    cpaTrend.push({
      period: weekLabel(wk),
      cpa: bucket && bucket.appts > 0 ? Math.round((bucket.spend / bucket.appts) * 100) / 100 : null,
    });
  }

  const hasAccounts = (accounts ?? []).length > 0;
  const hasTrendData = (spendHistory ?? []).length > 0 || (apptHistory ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="MAKI (internal client-acquisition) vs. client accounts."
      />
      {!hasAccounts ? (
        <div className="p-6 sm:p-10">
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">
              No accounts yet. Create your first account to start tracking.
            </p>
            <Link
              href="/accounts"
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
            >
              Go to Accounts →
            </Link>
          </div>
        </div>
      ) : (
        <DashboardView
          stats={stats}
          combinedCpa={combinedCpa}
          internalCpa={internalCpa}
          clientCpa={clientCpa}
          cpaSparkline={cpaSparkline}
          spendTrend={spendTrend}
          cpaTrend={cpaTrend}
          hasTrendData={hasTrendData}
        />
      )}
    </>
  );
}
