import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  computeFunnel,
  median,
  CHANNEL_LABELS,
  FUNNEL_STAGES,
  STAGE_LABELS,
} from "@/lib/outreach";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  OutreachContactsTable,
  type OutreachRow,
} from "@/components/outreach-contacts-table";
import { StaggerPage } from "@/components/dashboard/stagger-page";
import { FadeInSection } from "@/components/dashboard/fade-in-section";
import { StatCard } from "@/components/dashboard/stat-card";
import { HeroStatCard } from "@/components/dashboard/hero-stat-card";
import { FunnelRow } from "@/components/dashboard/funnel-row";
import { SectionLabel } from "@/components/dashboard/section-label";

export const dynamic = "force-dynamic";

const HOUR = 1000 * 60 * 60;

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Both only depend on `id`, not on each other — run together.
  const [{ data: script }, { data: contacts }] = await Promise.all([
    supabase.from("outreach_scripts").select("*").eq("id", id).single(),
    supabase
      .from("outreach_contacts")
      .select("*")
      .eq("script_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!script) notFound();

  const list = contacts ?? [];
  const funnel = computeFunnel(list);

  // Median time-to-reply and time-to-book (t0 = contacted_at, fall back to created_at).
  const t0 = (c: (typeof list)[number]) =>
    new Date(c.contacted_at ?? c.created_at).getTime();
  const replyHours = list
    .filter((c) => c.replied_at)
    .map((c) => (new Date(c.replied_at!).getTime() - t0(c)) / HOUR)
    .filter((h) => h >= 0);
  const bookHours = list
    .filter((c) => c.call_booked_at)
    .map((c) => (new Date(c.call_booked_at!).getTime() - t0(c)) / HOUR)
    .filter((h) => h >= 0);

  const medianReply = median(replyHours);
  const medianBook = median(bookHours);

  const funnelStages = FUNNEL_STAGES.map((stage) => ({
    label: STAGE_LABELS[stage],
    value: funnel[stage],
  }));

  const rows: OutreachRow[] = list.map((c) => ({
    id: c.id,
    name: c.name,
    contact_info: c.contact_info,
    ghl_contact_id: c.ghl_contact_id,
    niche: c.niche,
    channel: c.channel,
    status: c.status,
    scriptId: c.script_id,
    scriptName: script.name,
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
        title={script.name}
        description={`${CHANNEL_LABELS[script.channel]} script`}
      >
        <StatusBadge status={script.status} />
      </PageHeader>

      <StaggerPage>
        {script.content && (
          <FadeInSection>
            <blockquote className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground italic">
              “{script.content}”
            </blockquote>
          </FadeInSection>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HeroStatCard
            label="Median time to reply"
            value={medianReply}
            format={medianReply !== null ? "duration" : undefined}
            sub="Time from contacted to replied"
          />
          <HeroStatCard
            label="Median time to book"
            value={medianBook}
            format={medianBook !== null ? "duration" : undefined}
            sub="Time from contacted to call booked"
          />
        </section>

        <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Reached" value={funnel.contacted} format="num" />
        </section>

        <FadeInSection className="space-y-4">
          <SectionLabel>Funnel</SectionLabel>
          <FunnelRow stages={funnelStages} />
        </FadeInSection>

        <FadeInSection className="space-y-4">
          <SectionLabel>Contacts</SectionLabel>
          <OutreachContactsTable
            contacts={rows}
            scripts={[{ id: script.id, name: script.name }]}
          />
        </FadeInSection>
      </StaggerPage>
    </>
  );
}
