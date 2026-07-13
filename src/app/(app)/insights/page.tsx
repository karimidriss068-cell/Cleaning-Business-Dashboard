import { PageHeader } from "@/components/page-header";
import { InsightsChat } from "@/components/insights-chat";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/insights-usage";

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

  return (
    <>
      <PageHeader
        title="Insights"
        description="Ask plain-English questions and get answers from your live MAKI Ops data."
      />
      <div className="p-6">
        <InsightsChat
          configured={configured}
          initialUsage={{
            queryCount: usage.queryCount,
            cap: usage.cap,
            estimatedCostUsd: usage.estimatedCostUsd,
          }}
        />
      </div>
    </>
  );
}
