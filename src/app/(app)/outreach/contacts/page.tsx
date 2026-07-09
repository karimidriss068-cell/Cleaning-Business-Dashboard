import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import {
  OutreachContactsTable,
  type OutreachRow,
} from "@/components/outreach-contacts-table";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";

export const dynamic = "force-dynamic";

export default async function OutreachContactsPage() {
  const supabase = await createClient();

  const [{ data: contacts }, { data: scripts }] = await Promise.all([
    supabase
      .from("outreach_contacts")
      .select("*, script:outreach_scripts(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("outreach_scripts").select("id, name").order("name"),
  ]);

  const rows: OutreachRow[] = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    contact_info: c.contact_info,
    ghl_contact_id: c.ghl_contact_id,
    niche: c.niche,
    channel: c.channel,
    status: c.status,
    scriptId: c.script?.id ?? null,
    scriptName: c.script?.name ?? null,
    leadId: c.lead_id,
    created_at: c.created_at,
    contacted_at: c.contacted_at,
    replied_at: c.replied_at,
    call_booked_at: c.call_booked_at,
    call_held_at: c.call_held_at,
    closed_at: c.closed_at,
  }));

  return (
    <>
      <PageHeader
        title="Outreach Contacts"
        description="Every contact across all scripts. Update status inline or convert booked/closed contacts into leads."
      />
      <StaggerPage>
        <FadeInSection>
          <OutreachContactsTable contacts={rows} scripts={scripts ?? []} />
        </FadeInSection>
      </StaggerPage>
    </>
  );
}
