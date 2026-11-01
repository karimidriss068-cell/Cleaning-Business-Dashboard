import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { aiKeyStatus, loadAiSummary } from "@/lib/ai/usage-data";
import { PageHeader } from "@/components/shell/page-header";
import { AlertsPanel, CapsEditor, KillSwitch, Overview, RecentCalls, SpendByActor, SpendByFeature } from "@/components/ai/usage-panels";
import { GlassPanel } from "@/components/system/glass-panel";

export const metadata: Metadata = { title: "AI usage" };
export const dynamic = "force-dynamic";

/** Owner only: what AI has cost, the caps, and the kill switch. */
export default async function AiUsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (profile?.role !== "owner") redirect("/settings");

  const summary = await loadAiSummary(supabase);
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Settings
      </Link>
      <PageHeader eyebrow="Settings" title="AI usage" description="What AI has cost, the limits that protect the budget, and a switch to stop it all." />
      {summary ? (
        <>
          <AlertsPanel summary={summary} />
          <Overview summary={summary} keys={aiKeyStatus()} />
          <KillSwitch on={summary.kill_switch} />
          <div className="grid gap-6 lg:grid-cols-2">
            <SpendByFeature summary={summary} />
            <SpendByActor summary={summary} />
          </div>
          <CapsEditor summary={summary} />
          <RecentCalls summary={summary} />
        </>
      ) : (
        <GlassPanel className="p-5 text-sm text-ink-muted">AI usage couldn&apos;t be loaded. Try again in a moment.</GlassPanel>
      )}
    </div>
  );
}
