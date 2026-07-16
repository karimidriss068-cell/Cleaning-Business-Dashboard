import { PageHeader } from "@/components/page-header";
import { InsightsChat } from "@/components/insights-chat";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/insights-usage";
import { getTodaysDigest } from "@/lib/insights-digest";
import { computePriorities } from "@/lib/priorities";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const configured = !!process.env.ANTHROPIC_API_KEY;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const usage = user
    ? await getMonthlyUsage(supabase, user.id)
    : { queryCount: 0, cap: 50, estimatedCostUsd: 0 };

  const digest = user ? await getTodaysDigest(supabase, user.id) : [];
  // Top of the ranked priorities list — surfaced prominently near the
  // empty-state suggestions so opening Insights immediately says where the
  // next hour is worth the most, before asking anything. Doesn't need
  // Anthropic configured, this is computed deterministically from Supabase
  // data, not an AI call.
  const priorities = user ? (await computePriorities(supabase)).slice(0, 2) : [];

  return (
    <>
      <PageHeader
        title="Insights"
        description="Ask plain-English questions and get answers from your live MAKI Ops data."
      />
      <InsightsChat
        configured={configured}
        initialUsage={{
          queryCount: usage.queryCount,
          cap: usage.cap,
          estimatedCostUsd: usage.estimatedCostUsd,
        }}
        initialDigest={digest}
        initialPriorities={priorities}
      />
    </>
  );
}
