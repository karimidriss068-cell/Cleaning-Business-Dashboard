"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Hammer } from "lucide-react";
import { toast } from "sonner";
import { buildPayouts } from "@/app/actions/payouts";
import { addDays } from "@/lib/format";
import { weekLabel } from "@/lib/payouts";
import { Button } from "@/components/ui/button";
import { useFinanceAction } from "@/components/invoices/use-finance-action";

/** Pick the Monday-to-Sunday week (New York) and build its payout drafts from collected visits. */
export function WeekBar({ weekStart, currentWeek, readyVisits }: { weekStart: string; currentWeek: string; readyVisits: number }) {
  const { run, pending } = useFinanceAction();
  const href = (w: string) => `/payouts?week=${w}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1" role="group" aria-label="Choose week">
        <Button variant="secondary" size="icon" aria-label="Previous week" className="size-10 md:size-9" render={<Link href={href(addDays(weekStart, -7))} />}><ChevronLeft /></Button>
        <p className="min-w-44 px-2 text-center text-sm font-medium text-ink tabular" data-testid="week-label">{weekLabel(weekStart)}</p>
        <Button variant="secondary" size="icon" aria-label="Next week" className="size-10 md:size-9" disabled={weekStart >= currentWeek} render={weekStart >= currentWeek ? undefined : <Link href={href(addDays(weekStart, 7))} />}><ChevronRight /></Button>
        {weekStart !== currentWeek && <Button variant="ghost" size="sm" className="h-9" render={<Link href="/payouts" />}>This week</Button>}
      </div>
      <Button
        className="h-11 sm:h-9"
        disabled={pending}
        onClick={() =>
          run(
            () => buildPayouts({ weekStart }),
            (r) => (r.built === 0 && r.skipped === 0 ? "Nothing is ready to pay yet" : `${r.built} payout${r.built === 1 ? "" : "s"} built${r.skipped ? `, ${r.skipped} already approved (new visits wait for next week)` : ""}`),
            undefined,
            (m) => toast.error(m),
          )
        }
        data-testid="build-payouts"
      >
        <Hammer aria-hidden /> {readyVisits > 0 ? `Build payouts (${readyVisits} ready)` : "Build payouts"}
      </Button>
    </div>
  );
}
