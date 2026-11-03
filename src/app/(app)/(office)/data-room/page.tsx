import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { DemoAnalytics } from "@/components/analytics/demo-analytics";

export const metadata: Metadata = { title: "Agent data room" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Business" title="Agent data room" description={<span>Every analytics feed your AI agents read, and what each bot returns. <Link href="/agents" className="underline">Open the Agent room floor →</Link></span>} />
      <DemoAnalytics pack="dataroom" />
    </div>
  );
}
