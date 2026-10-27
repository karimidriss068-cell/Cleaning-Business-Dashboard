import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, formatCalendarDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import type { LaneMode } from "@/lib/schedule-lanes";

const href = (date: string, mode: LaneMode) => `/schedule?date=${date}${mode === "person" ? "&view=person" : ""}`;

/** Date navigation and the crew / person lane toggle: plain links, no client state. */
export function BoardToolbar({ date, today, mode }: { date: string; today: string; mode: LaneMode }) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T00:00:00Z`));
  return (
    <div className="kc-enter flex flex-wrap items-center justify-between gap-3" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="flex items-center gap-2">
        <Link href={href(addDays(date, -1), mode)} aria-label="Previous day" className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
          <ChevronLeft />
        </Link>
        <Link href={href(addDays(date, 1), mode)} aria-label="Next day" className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
          <ChevronRight />
        </Link>
        <Link href={href(today, mode)} aria-disabled={date === today} className={cn(buttonVariants({ variant: "secondary" }), date === today && "pointer-events-none opacity-50")}>
          Today
        </Link>
        <div className="ml-1 leading-tight">
          <div className="font-heading text-lg font-medium text-ink">{weekday}</div>
          <div className="text-[13px] text-ink-muted tabular">{formatCalendarDate(date)}</div>
        </div>
      </div>
      <div role="group" aria-label="Lanes" className="inline-flex rounded-full border border-hairline bg-surface-raised/70 p-0.5">
        {([["crew", "Crews", Layers], ["person", "People", User]] as const).map(([value, label, Icon]) => (
          <Link
            key={value}
            href={href(date, value)}
            aria-current={mode === value ? "true" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-fast",
              mode === value ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
