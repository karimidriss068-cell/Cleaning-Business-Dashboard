import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prototypeRoutesEnabled } from "@/lib/flags";
import { PageHeader } from "@/components/shell/page-header";
import { PrototypeAnalytics } from "@/components/analytics/demo-analytics";

export const metadata: Metadata = { title: "Sales" };

export default function Page() {
  if (!prototypeRoutesEnabled()) notFound();
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Operate" title="Sales" description="Lead → booked funnel, speed-to-lead, rep leaderboard, pipeline and lost revenue." />
      <PrototypeAnalytics pack="sales" />
    </div>
  );
}
