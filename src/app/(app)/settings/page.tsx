import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ComingSoon title="Settings" icon={Settings}>
      Team members and roles, services and prices, and integrations (GHL, Stripe).
    </ComingSoon>
  );
}
