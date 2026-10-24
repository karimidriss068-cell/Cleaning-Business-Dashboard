import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "My jobs" };

export default function MyJobsPage() {
  return (
    <ComingSoon title="My jobs" icon={ClipboardCheck}>
      Your visits for today and the week ahead, with directions, access notes and photo upload.
    </ComingSoon>
  );
}
