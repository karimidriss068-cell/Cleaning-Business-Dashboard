"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatNyTime } from "@/lib/format";
import { cellId, shortName, visitsOnDate, type BoardVisit, type Lane } from "@/lib/schedule-lanes";
import { CalendarEvent } from "@/components/system/calendar-event";
import { Button } from "@/components/ui/button";

const dayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d),
    day: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d),
  };
};

const peopleLine = (v: BoardVisit, mode: "crew" | "person") =>
  mode === "crew" ? v.people.map((p) => shortName(p.name)).join(", ") || undefined : v.crewName ?? undefined;

function Cell({ lane, date, today, children }: { lane: Lane; date: string; today: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: cellId(lane.id, date) });
  return (
    <div
      ref={setNodeRef}
      data-cell={cellId(lane.id, date)}
      className={cn(
        "min-h-[88px] space-y-1 border-r border-b border-hairline p-1.5 transition-colors duration-fast last:border-r-0",
        today && "bg-brand/[0.04]",
        isOver && "bg-brand/[0.1] shadow-[inset_0_0_0_1px_var(--kc-accent)]",
      )}
    >
      {children}
    </div>
  );
}

function CellVisit({ visit, laneId, mode, dragging, onOpen }: { visit: BoardVisit; laneId: string; mode: "crew" | "person"; dragging: boolean; onOpen: (v: BoardVisit) => void }) {
  const movable = visit.status === "scheduled";
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `${visit.id}::${laneId}`, data: { visitId: visit.id, laneId, source: "board" }, disabled: !movable });
  const card = <CalendarEvent start={visit.start} end={visit.end} client={visit.clientName} crew={peopleLine(visit, mode)} status={visit.status} height={64} className="w-full" />;
  if (!movable) return card;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      data-visit-card
      aria-label={`Move ${visit.clientName}, ${formatNyTime(visit.start)}`}
      aria-roledescription="visit card"
      onClick={() => onOpen(visit)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(visit);
        }
      }}
      className={cn("cursor-grab touch-none rounded-sm active:cursor-grabbing", dragging && "opacity-35")}
    >
      {card}
    </div>
  );
}

/**
 * Desktop week view: a row per lane (crew or cleaner), a column per day,
 * Monday to Sunday. Drag a visit to another day or lane: it keeps its New
 * York time of day and duration. Same Move-sheet rules as the day board.
 */
export function WeekBoard({ days, today, lanes, mode, draggingId, onOpen }: { days: string[]; today: string; lanes: Lane[]; mode: "crew" | "person"; draggingId: string | null; onOpen: (v: BoardVisit) => void }) {
  return (
    <div className="max-h-[calc(100dvh-19rem)] min-h-[420px] overflow-auto rounded-md border border-hairline bg-surface surface-layer shadow-e1">
      <div className="grid min-w-full" style={{ gridTemplateColumns: `168px repeat(7, minmax(158px, 1fr))` }}>
        <div className="sticky top-0 left-0 z-30 h-14 border-r border-b border-hairline glass" />
        {days.map((d) => {
          const l = dayLabel(d);
          return (
            <div key={d} className={cn("sticky top-0 z-20 h-14 border-r border-b border-hairline px-3 py-2 last:border-r-0 glass", d === today && "text-brand-text")}>
              <div className="text-[11px] font-semibold tracking-[0.08em] uppercase">{l.weekday}</div>
              <div className="text-sm font-medium tabular">{l.day}</div>
            </div>
          );
        })}
        {lanes.map((lane) => (
          <div key={lane.id} className="contents">
            <div className="sticky left-0 z-10 border-r border-b border-hairline bg-surface px-3 py-2.5">
              <div className={cn("truncate text-sm font-medium", lane.kind === "unassigned" ? "text-warning" : "text-ink")}>{lane.label}</div>
              <div className="text-[12px] text-ink-muted tabular">{lane.visits.length} this week</div>
            </div>
            {days.map((d) => (
              <Cell key={d} lane={lane} date={d} today={d === today}>
                {visitsOnDate(lane.visits, d).map((v) => (
                  <CellVisit key={v.id} visit={v} laneId={lane.id} mode={mode} dragging={draggingId === `${v.id}::${lane.id}`} onOpen={onOpen} />
                ))}
              </Cell>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phone week agenda: each day with its visits in time order and a Reassign button. */
export function WeekAgenda({ days, today, visits, mode, onOpen }: { days: string[]; today: string; visits: BoardVisit[]; mode: "crew" | "person"; onOpen: (v: BoardVisit) => void }) {
  return (
    <div className="space-y-5">
      {days.map((d) => {
        const list = visitsOnDate(visits, d);
        const l = dayLabel(d);
        return (
          <section key={d} aria-label={`${l.weekday} ${l.day}`}>
            <h2 className="mb-2 flex items-center justify-between px-1">
              <span className={cn("font-heading text-lg font-medium", d === today ? "text-brand-text" : "text-ink")}>
                {l.weekday} <span className="tabular">{l.day}</span>
              </span>
              <span className="text-[13px] text-ink-muted tabular">{list.length}</span>
            </h2>
            {list.length === 0 ? (
              <p className="rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-muted">No visits.</p>
            ) : (
              <ul className="space-y-2">
                {list.map((v) => (
                  <li key={v.id} className="space-y-1.5">
                    <CalendarEvent start={v.start} end={v.end} client={v.clientName} crew={peopleLine(v, mode) ?? v.crewName ?? "Unassigned"} status={v.status} height={96} className="min-h-16 py-2.5" />
                    {v.status === "scheduled" && (
                      <Button variant="secondary" onClick={() => onOpen(v)} className="h-11 w-full" aria-label={`Reassign ${v.clientName}, ${formatNyTime(v.start)}`}>
                        Reassign
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
