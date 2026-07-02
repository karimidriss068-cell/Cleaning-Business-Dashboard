import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentWeekRange, money, num, perUnit } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";

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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { weekStart } = currentWeekRange();

  const [{ data: accounts }, { data: campaigns }] = await Promise.all([
    supabase.from("accounts").select("id, type"),
    supabase.from("campaigns").select("id, account_id, status"),
  ]);

  const accountType = new Map((accounts ?? []).map((a) => [a.id, a.type]));
  const campaignType = new Map(
    (campaigns ?? []).map((c) => [c.id, accountType.get(c.account_id)]),
  );

  const [{ data: spend }, { data: leads }, { data: appts }] = await Promise.all([
    supabase.from("spend_daily").select("campaign_id, spend").gte("date", weekStart),
    supabase.from("leads").select("campaign_id").gte("created_at", weekStart),
    supabase.from("appointments").select("account_id").gte("booked_at", weekStart),
  ]);

  const stats: Record<"internal" | "client", Ctx> = {
    internal: emptyCtx(),
    client: emptyCtx(),
  };

  for (const c of campaigns ?? []) {
    const t = accountType.get(c.account_id);
    if (t && c.status === "active") stats[t].activeCampaigns++;
  }
  for (const s of spend ?? []) {
    const t = campaignType.get(s.campaign_id);
    if (t) stats[t].spend += Number(s.spend ?? 0);
  }
  for (const l of leads ?? []) {
    const t = campaignType.get(l.campaign_id);
    if (t) stats[t].leads++;
  }
  for (const a of appts ?? []) {
    const t = accountType.get(a.account_id);
    if (t) stats[t].appts++;
  }

  const hasAccounts = (accounts ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="This week at a glance — internal client-acquisition vs. client accounts."
      />
      <div className="p-6">
        {!hasAccounts ? (
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
        ) : (
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-0">
            <div className="lg:pr-10">
              <ContextSection title="MAKI (Internal)" ctx={stats.internal} />
            </div>
            <div className="lg:border-l lg:border-border lg:pl-10">
              <ContextSection title="Clients" ctx={stats.client} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ContextSection({ title, ctx }: { title: string; ctx: Ctx }) {
  return (
    <section>
      <h2 className="mb-5 font-heading text-xl font-medium tracking-tight">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Active campaigns" value={num(ctx.activeCampaigns)} />
        <Stat label="Spend · this week" value={money(ctx.spend)} />
        <Stat label="Leads · this week" value={num(ctx.leads)} />
        <Stat label="Appts booked · this week" value={num(ctx.appts)} />
        <Stat
          label="Cost / appointment"
          value={perUnit(ctx.spend, ctx.appts)}
          sub="Spend ÷ appts booked (this week)"
          hero
          className="col-span-2"
        />
      </div>
    </section>
  );
}
