import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <ComingSoon title="Schedule" icon={CalendarDays}>
      The dispatch board: every visit by day and crew, with drag to reassign.
    </ComingSoon>
  );
}
