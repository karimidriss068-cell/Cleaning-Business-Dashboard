import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money, num, perUnit, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import { AddSpendForm } from "@/components/forms/add-spend-form";
import { AttachCreativeForm } from "@/components/forms/attach-creative-form";
import { AcknowledgeButton } from "@/components/acknowledge-button";
import { TriangleAlert } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*, account:accounts(id, name, type)")
    .eq("id", id)
    .single();

  if (!campaign) notFound();

  const { data: criticalAlert } = await supabase
    .from("alerts")
    .select("id, message")
    .eq("campaign_id", id)
    .eq("type", "cpa_critical")
    .eq("acknowledged", false)
    .order("triggered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: leads }, { data: spend }, { data: attached }] =
    await Promise.all([
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

  const leadIds = (leads ?? []).map((l) => l.id);

  const { data: appts } =
    leadIds.length > 0
      ? await supabase
          .from("appointments")
          .select("status")
          .in("lead_id", leadIds)
      : { data: [] };

  // Creatives available to attach: same account, not already attached.
  const attachedCreatives = (attached ?? [])
    .map((row) => row.creative)
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const attachedIds = new Set(attachedCreatives.map((c) => c.id));

  const { data: accountCreatives } = await supabase
    .from("creatives")
    .select("id, name")
    .eq("account_id", campaign.account_id)
    .order("name");
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

  const funnel = [
    { label: "Leads", value: leadsTotal },
    { label: "Contacted", value: contacted },
    { label: "Qualified", value: qualified },
    { label: "Booked", value: apptTotal },
    { label: "Showed", value: showed },
    { label: "Closed", value: closed },
  ];

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

      <div className="space-y-8 p-6">
        {/* Headline metrics */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total spend" value={money(totalSpend)} />
          <Stat label="Leads" value={num(leadsTotal)} />
          <Stat label="CPL" value={perUnit(totalSpend, leadsTotal)} sub="Cost per lead" />
          <Stat label="CPA" value={perUnit(totalSpend, apptTotal)} sub="Cost per appointment" hero />
        </section>

        {/* Funnel */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Funnel
          </h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {funnel.map((stage, i) => {
              const prev = i > 0 ? funnel[i - 1].value : null;
              const rate =
                prev && prev > 0
                  ? `${Math.round((stage.value / prev) * 100)}%`
                  : null;
              return (
                <div
                  key={stage.label}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {stage.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {num(stage.value)}
                  </p>
                  {rate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rate} of prev
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Daily spend */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Daily spend
          </h2>
          <AddSpendForm campaignId={id} />
          <div className="overflow-hidden rounded-lg border border-border">
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
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No spend entries yet.
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
          </div>
        </section>

        {/* Creatives */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Creatives
          </h2>
          <AttachCreativeForm campaignId={id} options={attachOptions} />
          <div className="overflow-hidden rounded-lg border border-border">
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
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No creatives attached.
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
          </div>
        </section>
      </div>
    </>
  );
}
