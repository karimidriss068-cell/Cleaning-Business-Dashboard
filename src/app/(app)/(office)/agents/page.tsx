import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prototypeRoutesEnabled } from "@/lib/flags";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { StatusPill } from "@/components/system/status-pill";

export const metadata: Metadata = { title: "Agent room" };

/** The Agents Vault "Live Floor": isometric board of every bot plus the 8 ops features (sample data). */
export default function AgentsPage() {
  if (!prototypeRoutesEnabled()) notFound();
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Business" title="Agent room"
        description={<span className="inline-flex flex-wrap items-center gap-2">Atlas and every team bot on the live floor: handoffs, approvals, guardrails, owner hours, SOPs, lead→payout, alerts, capacity and client health. <StatusPill tone="info">Sample data</StatusPill> <Link href="/data-room" className="underline">Agent data room →</Link></span>} />
      <p className="text-sm text-ink-muted">Design reference only. The floor mock-up lives in docs/design/agents/index.html; the real Agents build is still to be planned.</p>
    </div>
  );
}
