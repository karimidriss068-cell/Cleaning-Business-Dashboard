import Link from "next/link";
import { Camera, ChevronRight, ListChecks, MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { addressLine, checklistLabel, mapsUrl, payLabel } from "@/lib/crew";
import { formatNyTime } from "@/lib/format";
import { jobLabel, jobTone } from "@/lib/status";
import type { CrewVisit } from "@/lib/schemas/crew";
import { StatusPill } from "@/components/system/status-pill";
import { buttonVariants } from "@/components/ui/button";

/**
 * A visit for the crew screens: big time, service, address (tap for maps),
 * access notes, my pay, checklist and photo progress, one large tap to open.
 * `compact` is the quieter version used for the days after today.
 */
export function VisitCard({ visit: v, index = 0, compact = false }: { visit: CrewVisit; index?: number; compact?: boolean }) {
  const open = buttonVariants({ variant: v.status === "scheduled" || v.status === "in_progress" ? "default" : "secondary", size: "crew" });
  return (
    <article aria-label={`${v.client_name}, ${formatNyTime(v.scheduled_start)}`} className="kc-enter rounded-lg border glass-solid shadow-e1 p-5 shadow-e1" style={{ "--i": index } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-[28px] leading-8 font-semibold tracking-[-0.01em] text-ink tabular">{formatNyTime(v.scheduled_start)}</p>
          <p className="text-[15px] text-crew-muted tabular">until {formatNyTime(v.scheduled_end)}</p>
        </div>
        <StatusPill tone={jobTone(v.status)}>{jobLabel[v.status]}</StatusPill>
      </div>

      <p className="mt-3 text-[19px] font-medium text-ink">{v.service_name}</p>
      <p className="text-[17px] text-crew-muted">{v.client_name}</p>

      <a href={mapsUrl(v)} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-12 items-center gap-3 rounded-md border border-hairline bg-surface-raised/60 px-4 py-2 text-[17px] text-brand-text">
        <MapPin className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-ink">{addressLine(v)}</span>
          <span className="text-[14px]">Open in Maps</span>
        </span>
      </a>

      {v.access_instructions && (
        <p className={cn("mt-3 rounded-md bg-highlight p-3 text-[17px] text-ink")}>
          <span className="block text-[13px] font-semibold tracking-[0.1em] text-crew-muted uppercase">Access</span>
          {v.access_instructions}
        </p>
      )}
      {!compact && v.crew_notes && (
        <p className="mt-3 text-[17px] text-ink">
          <span className="block text-[13px] font-semibold tracking-[0.1em] text-crew-muted uppercase">From the office</span>
          {v.crew_notes}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[16px]">
        <div className="col-span-2 flex items-baseline justify-between border-t border-hairline pt-3">
          <dt className="text-crew-muted">Your pay</dt>
          <dd className="font-heading text-2xl font-medium text-ink tabular">{payLabel(v.my_pay_cents, v.pay_pending)}</dd>
        </div>
        <div className="flex items-center gap-2 text-crew-muted">
          <ListChecks className="size-5 shrink-0" aria-hidden />
          <span className="tabular">{checklistLabel(v.checklist_done, v.checklist_total)}</span>
        </div>
        <div className="flex items-center gap-2 text-crew-muted">
          <Camera className="size-5 shrink-0" aria-hidden />
          <span className="tabular">{v.photo_count} photo{v.photo_count === 1 ? "" : "s"}</span>
        </div>
        {v.teammates.length > 0 && (
          <div className="col-span-2 flex items-center gap-2 text-crew-muted">
            <Users className="size-5 shrink-0" aria-hidden />
            <span>With {v.teammates.join(", ")}</span>
          </div>
        )}
      </dl>

      <Link href={`/my-jobs/${v.job_id}`} className={cn(open, "mt-4")}>
        {v.status === "completed" ? "View visit" : "Open visit"}
        <ChevronRight className="size-6" aria-hidden />
      </Link>
    </article>
  );
}
