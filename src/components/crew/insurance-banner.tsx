import { OctagonX, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsuranceReminder } from "@/lib/crew";

/** Reminder about the cleaner's own insurance certificate; shown above their visits. */
export function InsuranceBanner({ reminder }: { reminder: InsuranceReminder }) {
  const Icon = reminder.tone === "danger" ? OctagonX : ShieldAlert;
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-lg border p-4 text-[17px]", reminder.tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : "border-warning/30 bg-warning-soft text-warning")}>
      <Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{reminder.title}</p>
        <p className="text-[15px] opacity-90">{reminder.detail}</p>
      </div>
    </div>
  );
}
