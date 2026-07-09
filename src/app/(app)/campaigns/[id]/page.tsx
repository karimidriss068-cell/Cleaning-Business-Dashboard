import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money, num, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { AddSpendForm } from "@/components/forms/add-spend-form";
import { MetaCampaignIdForm } from "@/components/forms/meta-campaign-id-form";
import { AttachCreativeForm } from "@/components/forms/attach-creative-form";
import { AcknowledgeButton } from "@/components/acknowledge-button";
import { TriangleAlert, DollarSign, Clapperboard } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";
import { CardShell } from "@/components/dashboard/card-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { HeroStatCard } from "@/components/dashboard/hero-stat-card";
import { FunnelRow } from "@/components/dashboard/funnel-row";
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

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Round 1 — every one of these only depends on `id`, so they run together
  // instead of as 5 sequential round-trips (each Postgrest hop measured
  // ~140-240ms; that was the single biggest cost on this page).
  const [
    { data: campaign },
    { data: criticalAlert },
    { data: leads },
    { data: spend },
    { data: attached },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, account:accounts(id, name, type)")
      .eq("id", id)
      .single(),
    supabase
      .from("alerts")
      .select("id, message")
      .eq("campaign_id", id)
      .eq("type", "cpa_critical")
      .eq("acknowledged", false)
      .order("triggered_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("leads").select("id, status").eq("campaign_id", id),
    supabase
      .from("spend_daily")
      .select("*")
      .eq("campaign_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("campaign_creatives")
      .select("creative:creatives(id, name, type, status)")
      .eq("campaign_id", id),
  ]);

  if (!campaign) notFound();

  const leadIds = (leads ?? []).map((l) => l.id);

  // Creatives available to attach: same account, not already attached.
  const attachedCreatives = (attached ?? [])
    .map((row) => row.creative)
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const attachedIds = new Set(attachedCreatives.map((c) => c.id));

  // Round 2 — appts needs leadIds from round 1, accountCreatives needs
  // campaign.account_id from round 1, but neither needs the other.
  const [{ data: appts }, { data: accountCreatives }] = await Promise.all([
    leadIds.length > 0
      ? supabase.from("appointments").select("status").in("lead_id", leadIds)
      : Promise.resolve({ data: [] as { status: string }[] }),
    supabase
      .from("creatives")
      .select("id, name")
      .eq("account_id", campaign.account_id)
      .order("name"),
  ]);
  const attachOptions = (accountCreatives ?? []).filter(
    (c) => !attachedIds.has(c.id),
  );

  // Metrics
  const totalSpend = (spend ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
  const leadsTotal = (leads ?? []).length;
  const contacted = (leads ?? []).filter((l) =>
    ["contacted", "qualified", "booked"].includes(l.status),
  ).length;
  const qualified = (leads ?? []).filter((l) =>
    ["qualified", "booked"].includes(l.status),
  ).length;
  const apptTotal = (appts ?? []).length;
  const showed = (appts ?? []).filter((a) =>
    ["showed", "closed"].includes(a.status),
  ).length;
  const closed = (appts ?? []).filter((a) => a.status === "closed").length;

  const cpl = leadsTotal > 0 ? totalSpend / leadsTotal : null;
  const cpa = apptTotal > 0 ? totalSpend / apptTotal : null;

  const funnel = [
    { label: "Leads", value: leadsTotal },
    { label: "Contacted", value: contacted },
    { label: "Qualified", value: qualified },
    { label: "Booked", value: apptTotal },
    { label: "Showed", value: showed },
    { label: "Closed", value: closed },
  ];

  // Spend trend — last 30 days, continuous (zero-filled), for this campaign only.
  const spendByDate = new Map((spend ?? []).map((s) => [s.date, Number(s.spend ?? 0)]));
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
  const cpaSparkline = spendTrend.slice(-14).map((p) => ({ date: p.date, value: p.spend }));

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={
          campaign.account ? `${campaign.account.name} · ${campaign.platform}` : campaign.platform
        }
      >
        <StatusBadge status={campaign.status} />
      </PageHeader>

      {criticalAlert && (
        <div className="mx-6 mt-6 flex flex-col gap-3 rounded-md border border-[var(--accent-bright)] bg-[color-mix(in_srgb,var(--accent-bright)_16%,transparent)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]">
            <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--accent-bright)]" />
            {criticalAlert.message}
          </div>
          <AcknowledgeButton alertId={criticalAlert.id} />
        </div>
      )}

      <StaggerPage>
        <HeroStatCard
          label="Cost per appointment"
          value={cpa}
          format="money"
          sub="Total spend ÷ appointments booked"
          sparklineData={cpaSparkline}
        />

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total spend" value={totalSpend} format="money" />
          <StatCard label="Leads" value={leadsTotal} format="num" />
          <StatCard
            label="CPL"
            value={cpl ?? "—"}
            format={cpl !== null ? "money" : undefined}
            sub="Cost per lead"
          />
        </section>

        <FadeInSection className="space-y-4">
          <SectionLabel>Funnel</SectionLabel>
          <FunnelRow stages={funnel} />
        </FadeInSection>

        {spendTrend.some((p) => p.spend > 0) && (
          <FadeInSection>
            <ChartPanel title="Spend trend" sub="Daily spend, last 30 days">
              <TrendAreaChart
                data={spendTrend}
                xKey="date"
                yKey="spend"
                format="money"
                gradientId={`campaignSpendGradient-${id}`}
              />
            </ChartPanel>
          </FadeInSection>
        )}

        <FadeInSection className="space-y-4">
          <SectionLabel>Daily spend</SectionLabel>
          <MetaCampaignIdForm campaignId={id} metaCampaignId={campaign.meta_campaign_id} />
          <AddSpendForm campaignId={id} />
          <CardShell className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(spend ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState
                        icon={DollarSign}
                        title="No spend entries yet"
                        description="Add a manual entry above, or map this campaign to Meta and sync to pull spend automatically."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {(spend ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">
                      {shortDate(s.date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(s.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(s.impressions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {num(s.clicks)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.source}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardShell>
        </FadeInSection>

        <FadeInSection className="space-y-4">
          <SectionLabel>Creatives</SectionLabel>
          <AttachCreativeForm campaignId={id} options={attachOptions} />
          <CardShell className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachedCreatives.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="p-0">
                      <EmptyState
                        icon={Clapperboard}
                        title="No creatives attached"
                        description="Attach a creative above to start rolling its performance up into this campaign."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {attachedCreatives.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">
                      {c.type}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
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
