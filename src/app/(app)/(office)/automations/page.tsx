import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Automations" };

export default function AutomationsPage() {
  return (
    <ComingSoon title="Automations" icon={Workflow}>
      Speed-to-lead texts, review requests and invoice reminders, with a run log.
    </ComingSoon>
  );
}
