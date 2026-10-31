import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { PageHeader } from "./page-header";

/** Placeholder for sections whose screens come in later steps. */
export function ComingSoon({ title, icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader title={title} />
      <div className="kc-enter rounded-md border glass-card" style={{ "--i": 1 } as React.CSSProperties}>
        <EmptyState icon={icon} title="This screen is next on the build list">
          {children}
        </EmptyState>
      </div>
    </div>
  );
}
