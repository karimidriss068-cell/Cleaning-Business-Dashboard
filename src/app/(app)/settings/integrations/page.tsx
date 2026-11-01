import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadGhlPage } from "@/lib/ghl/status-data";
import { PageHeader } from "@/components/shell/page-header";
import { ConnectionPanel } from "@/components/ghl/connection-panel";
import { FailedPanel } from "@/components/ghl/failed-panel";
import { GhlSettingsForm } from "@/components/ghl/settings-form";
import { MessageLog } from "@/components/ghl/message-log";
import { TemplatesPanel } from "@/components/ghl/templates-panel";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "admin") redirect("/settings");

  const data = await loadGhlPage(supabase);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app-url").replace(/\/$/, "");

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 md:px-6">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Settings
      </Link>
      <PageHeader eyebrow="Settings" title="Integrations" description="GoHighLevel: new leads in, stage changes out, and automated texts. Everything starts in dry-run." />
      <ConnectionPanel data={data} appUrl={appUrl} />
      <FailedPanel failed={data.status.failed} />
      <TemplatesPanel templates={data.templates} />
      <GhlSettingsForm settings={data.settings} />
      <MessageLog messages={data.status.recentMessages} />
    </div>
  );
}
