import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { allFontClasses } from "@/lib/theme/fonts";
import { PageHeader } from "@/components/shell/page-header";
import { loadSettings } from "@/lib/finance-data";
import { FinanceSettingsForm } from "@/components/settings/finance-settings-form";
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
  const canEditFinance = profile?.role === "owner" || profile?.role === "admin";
  const finance = isOffice ? await loadSettings(supabase) : null;

  return (
    // The previews show every direction's typefaces, so this page (only)
    // loads all of them; everywhere else loads just the selected direction's.
    <div className={`${allFontClasses} mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 md:px-6`}>
      <PageHeader eyebrow="Settings" title="Appearance" description="How Keystone looks for you. Everyone on the team picks their own." />
      <section aria-label="Appearance" className="kc-enter rounded-lg border glass-card p-5 md:p-6" style={{ "--i": 1 } as React.CSSProperties}>
        <AppearancePicker />
      </section>
      {finance && (
        <>
          <PageHeader eyebrow="Business" title="Invoicing & payouts" description="Sales tax, due dates and the 1099 threshold." className="pt-2" />
          <section aria-label="Invoicing and payout settings" className="kc-enter rounded-lg border glass-card p-5 md:p-6" style={{ "--i": 2 } as React.CSSProperties}>
            <FinanceSettingsForm settings={finance} canEdit={canEditFinance} />
          </section>
        </>
      )}
    </div>
  );
}
