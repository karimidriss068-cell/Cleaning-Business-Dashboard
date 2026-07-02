import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { LeadsTable, type LeadRow } from "@/components/leads-table";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const supabase = await createClient();

  const [{ data: leads }, { data: accounts }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, name, contact_info, source, status, created_at, campaign:campaigns(id, name, account:accounts(id, name))",
        )
        .order("created_at", { ascending: false }),
      supabase.from("accounts").select("id, name").order("name"),
      supabase.from("campaigns").select("id, name, account_id").order("name"),
    ]);

  const rows: LeadRow[] = (leads ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    contact_info: l.contact_info,
    source: l.source,
    status: l.status,
    created_at: l.created_at,
    campaignId: l.campaign?.id ?? null,
    campaignName: l.campaign?.name ?? null,
    accountId: l.campaign?.account?.id ?? null,
    accountName: l.campaign?.account?.name ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Leads"
        description="All leads across campaigns. Update status inline or convert qualified/booked leads to appointments."
      />
      <div className="p-6">
        <LeadsTable
          leads={rows}
          accounts={accounts ?? []}
          campaigns={campaigns ?? []}
        />
      </div>
    </>
  );
}
