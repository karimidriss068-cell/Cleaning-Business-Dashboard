import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
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
        <AppNav />
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
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
