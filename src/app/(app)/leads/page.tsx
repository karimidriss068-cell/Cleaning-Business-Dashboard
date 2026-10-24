import type { Metadata } from "next";
import { KanbanSquare } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Leads & Pipeline" };

export default function LeadsPage() {
  return (
    <ComingSoon title="Leads & Pipeline" icon={KanbanSquare}>
      Every web, Google, Meta, Nextdoor and Yelp lead on one board, from first reply to won.
    </ComingSoon>
  );
}
