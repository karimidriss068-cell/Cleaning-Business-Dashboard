import { createClient } from "@/lib/supabase/server";
import { computeFunnel, type OutreachContactStatus } from "@/lib/outreach";
import { PageHeader } from "@/components/page-header";
import { NewScriptDialog } from "@/components/forms/new-script-dialog";
import { OutreachLeaderboardView } from "@/components/outreach-leaderboard-view";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const supabase = await createClient();
  const [{ data: scripts }, { data: contacts }] = await Promise.all([
    supabase.from("outreach_scripts").select("*").order("created_at", { ascending: false }),
    supabase.from("outreach_contacts").select("script_id, status"),
  ]);

  const byScript = new Map<string, { status: OutreachContactStatus }[]>();
  for (const c of contacts ?? []) {
    if (!c.script_id) continue;
    const arr = byScript.get(c.script_id) ?? [];
    arr.push({ status: c.status });
    byScript.set(c.script_id, arr);
  }

  const rows = (scripts ?? []).map((script) => ({
    script,
    funnel: computeFunnel(byScript.get(script.id) ?? []),
  }));

  return (
    <>
      <PageHeader
        title="Script Leaderboard"
        description="Which cold-outreach hooks actually convert — and where they leak."
      >
        <NewScriptDialog />
      </PageHeader>

      <OutreachLeaderboardView rows={rows} />
    </>
  );
}
