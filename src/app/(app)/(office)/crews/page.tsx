import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { AnalyticsSection } from "@/components/analytics/analytics-section";

export const metadata: Metadata = { title: "Crews" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader eyebrow="Operate" title="Crews" description="Quality, utilization and earnings by crew." />
      <AnalyticsSection pack="crews" />
    </div>
  );
}
