import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { perUnit } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { NewCreativeDialog } from "@/components/forms/new-creative-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function CreativesPage() {
  const supabase = await createClient();

  const [
    { data: creatives },
    { data: accounts },
    { data: joins },
    { data: campaigns },
    { data: spend },
    { data: leads },
    { data: appts },
  ] = await Promise.all([
    supabase
      .from("creatives")
      .select("*, account:accounts(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("campaign_creatives").select("creative_id, campaign_id"),
    supabase.from("campaigns").select("id, name"),
    supabase.from("spend_daily").select("campaign_id, spend"),
    supabase.from("leads").select("id, campaign_id"),
    supabase.from("appointments").select("lead_id"),
  ]);

  // Rollup maps.
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  const spendByCampaign = new Map<string, number>();
  for (const s of spend ?? []) {
    spendByCampaign.set(
      s.campaign_id,
      (spendByCampaign.get(s.campaign_id) ?? 0) + Number(s.spend ?? 0),
    );
  }

  const leadCampaign = new Map((leads ?? []).map((l) => [l.id, l.campaign_id]));
  const apptsByCampaign = new Map<string, number>();
  for (const a of appts ?? []) {
    const cid = leadCampaign.get(a.lead_id);
    if (cid) apptsByCampaign.set(cid, (apptsByCampaign.get(cid) ?? 0) + 1);
  }

  // creative_id -> campaign_id[]
  const creativeCampaigns = new Map<string, string[]>();
  for (const j of joins ?? []) {
    const arr = creativeCampaigns.get(j.creative_id) ?? [];
    arr.push(j.campaign_id);
    creativeCampaigns.set(j.creative_id, arr);
  }

  return (
    <>
      <PageHeader
        title="Creatives"
        description="Creative library with rolled-up CPA across campaigns."
      >
        <NewCreativeDialog accounts={accounts ?? []} />
      </PageHeader>

      <div className="p-6">
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Used in campaigns</TableHead>
                <TableHead className="text-right">Rolled-up CPA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(creatives ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No creatives yet.
                  </TableCell>
                </TableRow>
              )}
              {(creatives ?? []).map((cr) => {
                const cids = creativeCampaigns.get(cr.id) ?? [];
                const rollupSpend = cids.reduce(
                  (s, id) => s + (spendByCampaign.get(id) ?? 0),
                  0,
                );
                const rollupAppts = cids.reduce(
                  (s, id) => s + (apptsByCampaign.get(id) ?? 0),
                  0,
                );
                const names = cids.map((id) => campaignName.get(id)).filter(Boolean);
                return (
                  <TableRow key={cr.id}>
                    <TableCell className="font-medium">{cr.name}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">
                      {cr.type}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={cr.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cr.account ? (
                        <Link
                          href={`/accounts/${cr.account.id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {cr.account.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs text-muted-foreground">
                      {names.length > 0 ? (
                        <span className="line-clamp-2">{names.join(", ")}</span>
                      ) : (
                        <span className="text-muted-foreground/60">
                          Not attached
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-primary">
                      {perUnit(rollupSpend, rollupAppts)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Rolled-up CPA = total spend ÷ total appointments across every campaign a
          creative is attached to (campaign-level attribution).
        </p>
      </div>
    </>
  );
}
