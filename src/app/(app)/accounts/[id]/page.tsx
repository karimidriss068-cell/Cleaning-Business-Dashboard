import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone, Clapperboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money, num, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AccountGuardrailsForm } from "@/components/forms/account-guardrails-form";
import { GenerateReportDialog } from "@/components/forms/generate-report-dialog";
import { EmptyState } from "@/components/empty-state";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";
import { CardShell } from "@/components/dashboard/card-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { HeroStatCard } from "@/components/dashboard/hero-stat-card";
import { SectionLabel } from "@/components/dashboard/section-label";
import { ChartPanel } from "@/components/dashboard/chart-panel";
import { TrendAreaChart } from "@/components/charts/trend-area-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const DAY = 86400000;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Round 1 — account, campaigns, creatives, appointments all depend only on
  // `id`, not on each other, so they run together instead of `account` being
  // awaited alone before the rest even start.
  const [
    { data: account },
    { data: campaigns },
    { data: creatives },
    { data: appointments },
  ] = await Promise.all([
    supabase.from("accounts").select("*").eq("id", id).single(),
    supabase
      .from("campaigns")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("creatives")
      .select("*")
      .eq("account_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("status, revenue_owed")
      .eq("account_id", id),
  ]);

  if (!account) notFound();

  const campaignIds = (campaigns ?? []).map((c) => c.id);

  let totalSpend = 0;
  let totalLeads = 0;
  let spendRows: { date: string; spend: number }[] = [];
  if (campaignIds.length > 0) {
    const [{ data: spend }, { count: leadCount }] = await Promise.all([
      supabase
        .from("spend_daily")
        .select("date, spend")
        .in("campaign_id", campaignIds),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds),
    ]);
    totalSpend = (spend ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
    totalLeads = leadCount ?? 0;
    spendRows = (spend ?? []).map((s) => ({ date: s.date, spend: Number(s.spend ?? 0) }));
  }

  const apptTotal = (appointments ?? []).length;
  const showed = (appointments ?? []).filter((a) => a.status === "showed").length;
  const revenueOwed = (appointments ?? []).reduce(
    (s, a) => s + Number(a.revenue_owed ?? 0),
    0,
  );
  const margin = revenueOwed - totalSpend;

  // Spend trend — last 30 days, continuous (zero-filled), across every campaign on this account.
  const spendByDate = new Map<string, number>();
  for (const s of spendRows) {
    spendByDate.set(s.date, (spendByDate.get(s.date) ?? 0) + s.spend);
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
  // Ambient pulse behind the Margin hero — recent daily spend, not a literal
  // daily margin (revenue is only tracked as a running total, not per-day).
  const marginSparkline = spendTrend.slice(-14).map((p) => ({ date: p.date, value: p.spend }));

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.type === "internal" ? "Internal" : "Client"}${
          account.niche ? ` · ${account.niche}` : ""
        }`}
      >
        <GenerateReportDialog accountId={account.id} />
        <StatusBadge status={account.status} />
      </PageHeader>

      <StaggerPage>
        <HeroStatCard
          label="Margin"
          value={margin}
          format="money"
          sub="Revenue owed − total spend"
          sparklineData={marginSparkline}
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total spend" value={totalSpend} format="money" />
          <StatCard label="Total inquiries" value={totalLeads} format="num" />
          <StatCard label="Consults" value={apptTotal} format="num" />
          <StatCard label="Showed" value={showed} format="num" />
          <StatCard label="Revenue owed" value={revenueOwed} format="money" />
        </section>

        {spendTrend.some((p) => p.spend > 0) && (
          <FadeInSection>
            <ChartPanel title="Spend trend" sub="Daily spend across all campaigns, last 30 days">
              <TrendAreaChart
                data={spendTrend}
                xKey="date"
                yKey="spend"
                format="money"
                gradientId={`accountSpendGradient-${id}`}
              />
            </ChartPanel>
          </FadeInSection>
        )}

        <FadeInSection className="space-y-4">
          <SectionLabel>CPA Guardrails</SectionLabel>
          <AccountGuardrailsForm
            accountId={account.id}
            cpaAlertThreshold={account.cpa_alert_threshold}
            autoPauseThreshold={account.auto_pause_threshold}
          />
          <p className="text-xs text-muted-foreground">
            The threshold checker warns at CPA ≥ alert and auto-pauses campaigns
            at CPA ≥ auto-pause (rolling 3-day).
          </p>
        </FadeInSection>

        <FadeInSection className="space-y-4">
          <SectionLabel>Campaigns</SectionLabel>
          <CardShell className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Daily budget</TableHead>
                  <TableHead className="text-right">Start</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        icon={Megaphone}
                        title="No campaigns for this account"
                        description="Create a campaign under this account from the Campaigns page to start tracking spend and inquiries."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {(campaigns ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {c.platform}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(c.budget_daily)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {shortDate(c.start_date)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardShell>
        </FadeInSection>

        <FadeInSection className="space-y-4">
          <SectionLabel>Creatives</SectionLabel>
          <CardShell className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(creatives ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState
                        icon={Clapperboard}
                        title="No creatives for this account"
                        description="Add a creative from the Creatives page and attach it to a campaign here."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {(creatives ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">
                      {c.type}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {c.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardShell>
        </FadeInSection>
      </StaggerPage>
    </>
  );
}
