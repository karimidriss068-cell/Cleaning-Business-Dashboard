import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { num, pct, duration } from "@/lib/format";
import {
  computeFunnel,
  median,
  CHANNEL_LABELS,
  FUNNEL_STAGES,
  STAGE_LABELS,
} from "@/lib/outreach";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusBadge } from "@/components/status-badge";
import {
  OutreachContactsTable,
  type OutreachRow,
} from "@/components/outreach-contacts-table";

export const dynamic = "force-dynamic";

const HOUR = 1000 * 60 * 60;

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: script } = await supabase
    .from("outreach_scripts")
    .select("*")
    .eq("id", id)
    .single();

  if (!script) notFound();

  const { data: contacts } = await supabase
    .from("outreach_contacts")
    .select("*")
    .eq("script_id", id)
    .order("created_at", { ascending: false });

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

  const rates = [
    1,
    funnel.replyRate,
    funnel.callBookedRate,
    funnel.callHeldRate,
    funnel.closeRate,
  ];
  const counts = [
    funnel.contacted,
    funnel.replied,
    funnel.call_booked,
    funnel.call_held,
    funnel.closed,
  ];

  const rows: OutreachRow[] = list.map((c) => ({
    id: c.id,
    name: c.name,
    contact_info: c.contact_info,
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

      <div className="space-y-8 p-6">
        {script.content && (
          <blockquote className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground italic">
            “{script.content}”
          </blockquote>
        )}

        {/* Timing */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Reached" value={num(funnel.contacted)} />
          <Stat label="Median time to reply" value={duration(median(replyHours))} />
          <Stat
            label="Median time to book"
            value={duration(median(bookHours))}
            hero
          />
        </section>

        {/* Funnel breakdown */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Funnel
          </h2>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
            {FUNNEL_STAGES.map((stage, i) => {
              const prev = i > 0 ? counts[i - 1] : null;
              const step =
                prev && prev > 0 ? Math.round((counts[i] / prev) * 100) : null;
              return (
                <div
                  key={stage}
                  className="rounded-md border border-border bg-card p-4"
                >
                  <p className="kpi-label">{STAGE_LABELS[stage]}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {num(counts[i])}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pct(rates[i])} of reached
                    {step !== null && ` · ${step}% step`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Contacts */}
        <section className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Contacts
          </h2>
          <OutreachContactsTable
            contacts={rows}
            scripts={[{ id: script.id, name: script.name }]}
          />
        </section>
      </div>
    </>
  );
}
