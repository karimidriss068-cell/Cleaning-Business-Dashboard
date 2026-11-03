import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prototypeRoutesEnabled } from "@/lib/flags";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/system/status-pill";
import { AgentFloor } from "@/components/agents/agent-floor";
import { DemoAnalytics } from "@/components/analytics/demo-analytics";

export const metadata: Metadata = { title: "Agent room" };

/** The Agents Vault live floor: every bot, what it's doing, what needs you. Sample data. */
export default function AgentsPage() {
  if (!prototypeRoutesEnabled()) notFound();
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Business" title="Agent room"
        description={<span className="inline-flex flex-wrap items-center gap-2">Atlas and the team bots: live status, approvals, handoffs and guardrails. <StatusPill tone="info">Demo data</StatusPill> <Link href="/board" className="underline underline-offset-2">Roast Room →</Link></span>} />
      <AgentFloor dataRoom={<DemoAnalytics pack="dataroom" />} />
    </div>
  );
}
