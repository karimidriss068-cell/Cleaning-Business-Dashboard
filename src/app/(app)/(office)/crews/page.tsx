import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Crews" };

export default function CrewsPage() {
  return (
    <ComingSoon title="Crews" icon={Users}>
      Subcontractors, crews, pay terms, W-9s and insurance expiry in one place.
    </ComingSoon>
  );
}
