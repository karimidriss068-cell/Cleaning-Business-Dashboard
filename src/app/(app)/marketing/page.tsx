import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Marketing" };

export default function MarketingPage() {
  return (
    <ComingSoon title="Marketing" icon={Megaphone}>
      Campaign spend, leads and cost per booked job by channel.
    </ComingSoon>
  );
}
