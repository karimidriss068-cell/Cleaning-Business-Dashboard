import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Placeholder home until the redesign. Shows the signed-in member's role so
// the auth + RLS wiring can be checked end to end.
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  return (
    <section className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {profile
          ? `Signed in as ${profile.full_name} (${profile.role}). The new dashboard is being built.`
          : "Your login has no team profile yet, so you can't see any data. Ask the owner to add you."}
      </p>
    </section>
  );
}
