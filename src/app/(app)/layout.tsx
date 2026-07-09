import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { signOut } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { count: alertCount } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .eq("acknowledged", false);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="font-heading text-xl font-bold tracking-tight text-primary">
            MAKI
          </span>
          <span className="font-heading text-xl font-light tracking-tight text-muted-foreground">
            Ops
          </span>
        </div>
        <AppNav alertCount={alertCount ?? 0} />
        <div className="mt-auto border-t border-border p-3">
          <p className="truncate px-2 pb-2 text-xs text-muted-foreground">
            {user.email}
          </p>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav alertCount={alertCount ?? 0} />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
