import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { money, num, shortDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .single();

  if (!account) notFound();

  const [{ data: campaigns }, { data: creatives }, { data: appointments }] =
    await Promise.all([
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

  const campaignIds = (campaigns ?? []).map((c) => c.id);

  let totalSpend = 0;
  let totalLeads = 0;
  if (campaignIds.length > 0) {
    const [{ data: spend }, { count: leadCount }] = await Promise.all([
      supabase.from("spend_daily").select("spend").in("campaign_id", campaignIds),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("campaign_id", campaignIds),
    ]);
    totalSpend = (spend ?? []).reduce((s, r) => s + Number(r.spend ?? 0), 0);
    totalLeads = leadCount ?? 0;
  }

  const apptTotal = (appointments ?? []).length;
  const showed = (appointments ?? []).filter((a) => a.status === "showed").length;
  const revenueOwed = (appointments ?? []).reduce(
    (s, a) => s + Number(a.revenue_owed ?? 0),
    0,
  );
  const margin = revenueOwed - totalSpend;

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${account.type === "internal" ? "Internal" : "Client"}${
          account.niche ? ` · ${account.niche}` : ""
        }`}
      >
        <StatusBadge status={account.status} />
      </PageHeader>

      <div className="space-y-8 p-6">
        {/* Mini P&L */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Mini P&amp;L
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total spend" value={money(totalSpend)} />
            <Stat label="Total leads" value={num(totalLeads)} />
            <Stat label="Appointments" value={num(apptTotal)} />
            <Stat label="Showed" value={num(showed)} />
            <Stat label="Revenue owed" value={money(revenueOwed)} />
            <Stat
              label="Margin"
              value={money(margin)}
              sub="Revenue − spend"
              accent
            />
          </div>
        </section>

        {/* Campaigns */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Campaigns
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
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
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No campaigns for this account.
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
          </div>
        </section>

        {/* Creatives */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Creatives
          </h2>
          <div className="overflow-hidden rounded-lg border border-border">
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
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No creatives for this account.
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
          </div>
        </section>
      </div>
    </>
  );
}
