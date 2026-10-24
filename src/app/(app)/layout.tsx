import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/config/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileTabBar, MobileTopBar } from "@/components/shell/mobile-nav";
import { AppCommandPalette } from "@/components/shell/app-command-palette";
import { DemoBanner } from "@/components/shell/demo-banner";
import { TopBar } from "@/components/shell/top-bar";
import { Ambient } from "@/components/system/ambient";
import { AppearanceSync } from "@/components/shell/appearance-sync";
import { loadPreferences } from "@/lib/theme/load-preferences";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Office staff",
  subcontractor: "Crew",
};

// App shell (DESIGN.md section 9): sidebar from 768px, top bar + bottom tab
// bar on phones, Cmd+K palette, and the demo-data banner while seed rows exist.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: demoData }, appearance] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("demo_data_present"),
    loadPreferences(supabase, user.id),
  ]);

  const role = profile?.role ?? null;
  const userName = profile?.full_name ?? user.email ?? "Signed in";
  const roleLabel = role ? ROLE_LABELS[role] : "No team profile";

  return (
    <div className="relative flex min-h-dvh">
      <Ambient />
      <Sidebar role={role} userName={userName} roleLabel={roleLabel} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <TopBar />
        {demoData === true && <DemoBanner />}
        <main className="flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>
      <MobileTabBar role={role} userName={userName} roleLabel={roleLabel} />
      <AppCommandPalette role={role} />
      <AppearanceSync loaded={appearance} />
    </div>
  );
}
