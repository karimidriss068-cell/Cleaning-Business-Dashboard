import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

// Minimal shell kept through the conversion; the real navigation arrives
// with the redesign.
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-heading text-lg font-bold tracking-tight text-primary">
          Cleaning Ops
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {user.email}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
