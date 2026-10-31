"use client";

import { useDraggable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNyDate, formatNyTime } from "@/lib/format";
import { UNASSIGNED_LANE, type BoardVisit } from "@/lib/schedule-lanes";
import { EmptyState } from "@/components/system/empty-state";
import { Button } from "@/components/ui/button";

function TrayItem({ visit, dragging, onOpen }: { visit: BoardVisit; dragging: boolean; onOpen: (v: BoardVisit) => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `tray::${visit.id}`, data: { visitId: visit.id, laneId: UNASSIGNED_LANE, source: "tray" } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      data-visit-card
      aria-label={`Assign ${visit.clientName}, ${formatNyDate(visit.start, "weekday")} ${formatNyTime(visit.start)}`}
      aria-roledescription="unassigned visit"
      onClick={() => onOpen(visit)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(visit);
        }
      }}
      className={cn(
        "cursor-grab touch-none rounded-sm border border-hairline border-l-2 border-l-warning-fill bg-surface-raised/60 px-2.5 py-2 text-xs leading-4 transition-colors duration-fast hover:border-border-input active:cursor-grabbing",
        dragging && "opacity-35",
      )}
    >
      <div className="font-medium text-ink tabular">
        {formatNyDate(visit.start, "weekday")} · {formatNyTime(visit.start)}–{formatNyTime(visit.end)}
      </div>
      <div className="truncate font-medium text-ink">{visit.clientName}</div>
      <div className="truncate text-ink-muted capitalize">
        {[visit.serviceName, visit.borough?.replace("_", " "), visit.crewName].filter(Boolean).join(" · ")}
      </div>
    </div>
  );
}

/**
 * Desktop tray: scheduled visits in the next 7 days with no cleaner. Drag one
 * onto a lane (day view) or a day cell (week view); a visit on another day keeps
 * its own date and time when dropped on a day-view lane.
 */
export function UnassignedTray({ visits, draggingId, onOpen }: { visits: BoardVisit[]; draggingId: string | null; onOpen: (v: BoardVisit) => void }) {
  return (
    <aside aria-label="Unassigned visits" className="hidden w-72 shrink-0 self-start rounded-md border glass-card md:block">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="font-heading text-lg font-medium text-ink">Unassigned</h2>
        <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-medium tabular ring-1 ring-inset", visits.length ? "bg-warning-soft text-warning ring-warning/30" : "text-ink-muted ring-hairline")}>{visits.length}</span>
      </header>
      <div className="max-h-[calc(100dvh-24rem)] min-h-24 space-y-2 overflow-y-auto p-3">
        {visits.length === 0 ? (
          <EmptyState icon={Inbox} title="Everyone is covered" className="px-2 py-6">Visits in the next 7 days without a cleaner show up here.</EmptyState>
        ) : (
          visits.map((v) => <TrayItem key={v.id} visit={v} dragging={draggingId === `tray::${v.id}`} onOpen={onOpen} />)
        )}
      </div>
      <p className="border-t border-hairline px-4 py-2.5 text-[12px] text-ink-muted">Next 7 days. Drag onto a crew or day, or click to assign.</p>
    </aside>
  );
}

/** Phone tray: the same visits as a list with a Reassign button. */
export function UnassignedTrayPhone({ visits, onOpen }: { visits: BoardVisit[]; onOpen: (v: BoardVisit) => void }) {
  if (visits.length === 0) return null;
  return (
    <section aria-label="Unassigned visits, next 7 days" className="rounded-md border border-hairline bg-highlight p-4 md:hidden">
      <h2 className="font-heading text-lg font-medium text-ink">
        Unassigned <span className="text-warning tabular">({visits.length})</span>
      </h2>
      <p className="text-[13px] text-ink-muted">Next 7 days, no cleaner yet.</p>
      <ul className="mt-3 space-y-2">
        {visits.map((v) => (
          <li key={v.id} className="rounded-sm border border-hairline bg-surface/80 p-3">
            <div className="text-sm font-medium text-ink tabular">
              {formatNyDate(v.start, "weekday")} · {formatNyTime(v.start)}
            </div>
            <div className="text-sm text-ink">{v.clientName}</div>
            <Button variant="secondary" onClick={() => onOpen(v)} className="mt-2 h-11 w-full" aria-label={`Assign ${v.clientName}, ${formatNyDate(v.start, "weekday")} ${formatNyTime(v.start)}`}>
              Assign
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
