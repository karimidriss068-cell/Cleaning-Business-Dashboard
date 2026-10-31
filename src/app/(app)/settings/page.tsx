import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { allFontClasses } from "@/lib/theme/fonts";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { AppearancePicker } from "@/components/settings/appearance-picker";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const isOffice = profile !== null && profile.role !== "subcontractor";

  return (
    // The previews show every direction's typefaces, so this page (only)
    // loads all of them; everywhere else loads just the selected direction's.
    <div className={`${allFontClasses} mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 md:px-6`}>
      <PageHeader eyebrow="Settings" title="Appearance" description="How Keystone looks for you. Everyone on the team picks their own." />
      <section aria-label="Appearance" className="kc-enter rounded-lg border glass-card p-5 md:p-6" style={{ "--i": 1 } as React.CSSProperties}>
        <AppearancePicker />
      </section>
      {isOffice && (
        <section aria-label="Business settings" className="kc-enter rounded-md border glass-card" style={{ "--i": 2 } as React.CSSProperties}>
          <EmptyState icon={Building2} title="Team, services and integrations come next">
            Team members and roles, services and prices, and the GHL and Stripe connections will live here.
          </EmptyState>
        </section>
      )}
    </div>
  );
}
