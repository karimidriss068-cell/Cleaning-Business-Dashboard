import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadPricingRules } from "@/lib/pricing-data";
import { PageHeader } from "@/components/shell/page-header";
import { GlassPanel } from "@/components/system/glass-panel";
import { PricingRulesForm } from "@/components/settings/pricing-rules-form";

export const metadata: Metadata = { title: "Pricing rules" };
export const dynamic = "force-dynamic";

/** Owner and admin: the numbers every bid is priced from. */
export default async function PricingRulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "admin") redirect("/settings");

  const rules = await loadPricingRules(supabase);
  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 md:px-6">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-3.5" aria-hidden /> Settings
      </Link>
      <PageHeader eyebrow="Settings" title="Pricing rules" description="The numbers every bid is priced from: labor, supplies, margin and a rate for each kind of space." />
      {rules === null ? (
        <GlassPanel className="p-5 text-sm text-ink-muted">Pricing rules couldn&apos;t be loaded. Try again in a moment.</GlassPanel>
      ) : (
        <>
          {!rules.confirmed && (
            <div role="status" className="flex items-start gap-3 rounded-md border border-warning-fill/50 bg-warning-soft p-4 text-sm text-ink" data-testid="pricing-placeholder-note">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p><strong className="font-semibold">These are placeholder numbers.</strong> Replace them with your own and save once to confirm them. Until then every margin, rate and cost shown on a bid is a guess.</p>
            </div>
          )}
          <PricingRulesForm key={rules.version} rules={rules} />
        </>
      )}
    </div>
  );
}
