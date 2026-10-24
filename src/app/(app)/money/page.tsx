import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export const metadata: Metadata = { title: "Invoices & Payouts" };

export default function MoneyPage() {
  return (
    <ComingSoon title="Invoices & Payouts" icon={Receipt}>
      Invoices, Stripe payments and subcontractor payouts, with overdue follow-up.
    </ComingSoon>
  );
}
