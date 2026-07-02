import { PageHeader } from "@/components/page-header";
import { InsightsChat } from "@/components/insights-chat";

export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const configured = !!process.env.ANTHROPIC_API_KEY;

  return (
    <>
      <PageHeader
        title="Insights"
        description="Ask plain-English questions and get answers from your live MAKI Ops data."
      />
      <div className="p-6">
        <InsightsChat configured={configured} />
      </div>
    </>
  );
}
