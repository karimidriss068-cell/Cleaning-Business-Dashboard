import { createClient } from "@/lib/supabase/server";
import { prototypeRoutesEnabled } from "@/lib/flags";
import { AnalyticsSection } from "@/components/analytics/analytics-section";
import type { PACKS } from "@/components/analytics/packs";

/**
 * The analytics packs are invented sample numbers, so real pages never show them
 * on their own. They appear only when demo mode is switched on (DEMO_ANALYTICS=1)
 * AND seeded demo rows (ids starting 5eed0000-) are still in the database, so the
 * purge that removes the demo data also removes them from every page.
 */
export async function demoAnalyticsVisible(): Promise<boolean> {
  if (process.env.DEMO_ANALYTICS !== "1") return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .gte("id", "5eed0000-0000-0000-0000-000000000000")
    .lt("id", "5eed0001-0000-0000-0000-000000000000");
  return (count ?? 0) > 0;
}

export async function DemoAnalytics({ pack }: { pack: keyof typeof PACKS }) {
  if (!(await demoAnalyticsVisible())) return null;
  return <AnalyticsSection pack={pack} />;
}

/**
 * Prototype screens (Sales, Agent room, Agent data room) are sample-only by design
 * and already sit behind NEXT_PUBLIC_PROTOTYPE_ROUTES, so they may show a pack
 * without demo mode. Real pages must keep using DemoAnalytics; a test enforces that
 * only prototype-gated pages import this.
 */
export async function PrototypeAnalytics({ pack }: { pack: keyof typeof PACKS }) {
  if (!prototypeRoutesEnabled()) return null;
  return <AnalyticsSection pack={pack} />;
}
