import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, formatCalendarDate } from "@/lib/format";
import { weekOf, type LaneMode } from "@/lib/schedule-lanes";
import { buttonVariants } from "@/components/ui/button";

export type Range = "day" | "week";

const href = (date: string, mode: LaneMode, range: Range) => `/schedule?date=${date}${mode === "person" ? "&view=person" : ""}${range === "week" ? "&range=week" : ""}`;

const toggle = (active: boolean) =>
  cn("flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-fast", active ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink");

/** Date navigation, Day/Week range and the crew / person lane toggle: plain links, no client state. */
export function BoardToolbar({ date, today, mode, range }: { date: string; today: string; mode: LaneMode; range: Range }) {
  const step = range === "week" ? 7 : 1;
  const week = weekOf(date);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T00:00:00Z`));
  const title = range === "week" ? `${formatCalendarDate(week[0]).replace(/, \d{4}$/, "")} – ${formatCalendarDate(week[6])}` : weekday;
  const subtitle = range === "week" ? "Week" : formatCalendarDate(date);
  const atToday = range === "week" ? week.includes(today) : date === today;
  return (
    <div className="kc-enter flex flex-wrap items-center justify-between gap-3" style={{ "--i": 1 } as React.CSSProperties}>
      <div className="flex items-center gap-2">
        <Link href={href(addDays(date, -step), mode, range)} aria-label={range === "week" ? "Previous week" : "Previous day"} className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
          <ChevronLeft />
        </Link>
        <Link href={href(addDays(date, step), mode, range)} aria-label={range === "week" ? "Next week" : "Next day"} className={cn(buttonVariants({ variant: "secondary", size: "icon" }))}>
          <ChevronRight />
        </Link>
        <Link href={href(today, mode, range)} aria-disabled={atToday} className={cn(buttonVariants({ variant: "secondary" }), atToday && "pointer-events-none opacity-50")}>
          Today
        </Link>
        <div className="ml-1 leading-tight">
          <div className="font-heading text-lg font-medium text-ink tabular">{title}</div>
          <div className="text-[13px] text-ink-muted tabular">{subtitle}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Range" className="inline-flex rounded-full border border-hairline bg-surface-raised/70 p-0.5">
          {(["day", "week"] as const).map((r) => (
            <Link key={r} href={href(date, mode, r)} aria-current={range === r ? "true" : undefined} className={toggle(range === r)}>
              {r === "day" ? "Day" : "Week"}
            </Link>
          ))}
        </div>
        <div role="group" aria-label="Lanes" className="inline-flex rounded-full border border-hairline bg-surface-raised/70 p-0.5">
          {([["crew", "Crews", Layers], ["person", "People", User]] as const).map(([value, label, Icon]) => (
            <Link key={value} href={href(date, value, range)} aria-current={mode === value ? "true" : undefined} className={toggle(mode === value)}>
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
