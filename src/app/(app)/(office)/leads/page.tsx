import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KanbanSquare, UserX } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addDays, nyToday } from "@/lib/format";
import { followUpStatus, sourceLabel, winRatePercent, type LeadSource } from "@/lib/leads";
import { loadLeads } from "@/lib/leads-data";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { LeadsClient } from "@/components/leads/leads-client";
import { NewLeadButton } from "@/components/leads/quick-add-lead";

export const metadata: Metadata = { title: "Leads & Pipeline" };
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ lead: z.string().uuid().optional().catch(undefined) });

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "subcontractor") redirect("/my-jobs");
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">
        <div className="rounded-md border glass-card">
          <EmptyState icon={UserX} title="Your login isn't on the team yet">Ask the owner to add you.</EmptyState>
        </div>
      </div>
    );
  }

  const { lead: openId } = paramsSchema.parse(await searchParams);
  const now = new Date();
  const today = nyToday(now);
  const [{ leads, team }, report] = await Promise.all([
    loadLeads(supabase, new Date(now.getTime() - 60 * 86400000).toISOString()),
    supabase.rpc("lead_conversion_by_source", { p_from: addDays(today, -89), p_to: today }),
  ]);
  if (report.error) throw new Error(`Conversion report failed: ${report.error.message}`);
  const open = leads.filter((l) => ["new", "contacted", "quoted"].includes(l.stage));
  const overdue = open.filter((l) => followUpStatus(l.nextFollowUpOn, l.stage, today) === "overdue").length;
  const rows = (report.data ?? []).map((r) => ({ source: r.source, leads: Number(r.leads), booked: Number(r.booked), lost: Number(r.lost), open: Number(r.open) }));
  const dataKey = leads.reduce((h, l) => (h * 31 + [...`${l.id}${l.updatedAt}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) | 0, 7).toString(36);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Sales"
        title="Leads & Pipeline"
        description={`${open.length} open lead${open.length === 1 ? "" : "s"} · ${overdue} follow-up${overdue === 1 ? "" : "s"} overdue`}
        actions={<NewLeadButton />}
      />
      {leads.length === 0 ? (
        <div className="rounded-md border glass-card">
          <EmptyState icon={KanbanSquare} title="No leads yet">Add one with New lead, or press Cmd+K and choose New lead.</EmptyState>
        </div>
      ) : (
        <LeadsClient key={dataKey} initialLeads={leads} team={team} today={today} now={now.toISOString()} openId={openId ?? null} />
      )}

      <section aria-label="Conversion by source" className="rounded-md border glass-card">
        <header className="border-b border-hairline px-4 py-3">
          <h2 className="font-heading text-lg font-medium text-ink">Conversion by source</h2>
          <p className="text-[13px] text-ink-muted">Leads created in the last 90 days. Win rate is booked out of booked plus lost.</p>
        </header>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-muted">No leads in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[12px] text-ink-muted">
                  <th scope="col" className="px-4 py-2 font-medium">Source</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Leads</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Booked</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Lost</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Open</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const w = winRatePercent(r);
                  return (
                    <tr key={r.source} className="border-t border-hairline">
                      <th scope="row" className="px-4 py-2 text-left font-medium text-ink">{sourceLabel[r.source as LeadSource] ?? r.source}</th>
                      <td className="px-2 py-2 text-right text-ink tabular">{r.leads}</td>
                      <td className="px-2 py-2 text-right text-ink tabular">{r.booked}</td>
                      <td className="px-2 py-2 text-right text-ink tabular">{r.lost}</td>
                      <td className="px-2 py-2 text-right text-ink tabular">{r.open}</td>
                      <td className="px-4 py-2 text-right font-medium text-ink tabular">{w === null ? "—" : `${w}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
