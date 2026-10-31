"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatNyTime } from "@/lib/format";
import { hourMarks, layoutColumns, placeInDay } from "@/lib/dispatch";
import { shortName, type BoardVisit, type Lane } from "@/lib/schedule-lanes";
import { CalendarEvent, CalendarNowLine } from "@/components/system/calendar-event";
import { Button } from "@/components/ui/button";
import { BoardScroller } from "./board-scroller";

export const HOUR_PX = 60;
const WINDOW_HOURS = 14;
export const BOARD_HEIGHT = HOUR_PX * WINDOW_HOURS;
const TIME_COL = 56;
const HEADER_PX = 57; // 56px header + 1px border

const peopleLine = (v: BoardVisit, mode: "crew" | "person") =>
  mode === "crew" ? v.people.map((p) => shortName(p.name)).join(", ") || undefined : v.crewName ?? undefined;

function LaneColumn({ lane, children }: { lane: Lane; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });
  return (
    <div
      ref={setNodeRef}
      data-lane={lane.id}
      className={cn("relative border-r border-hairline transition-colors duration-fast last:border-r-0", isOver && "bg-brand/[0.06] shadow-[inset_0_0_0_1px_var(--kc-accent)]")}
      style={{ height: BOARD_HEIGHT }}
    >
      {children}
    </div>
  );
}

/**
 * A visit on the board. Scheduled visits drag (pointer, 6px to start) and open
 * the Move sheet on click or Enter/Space, which is also the keyboard path.
 * Completed, cancelled and no-access visits are fixed.
 */
function VisitCard({
  visit,
  laneId,
  style,
  height,
  mode,
  dragging,
  onOpen,
}: {
  visit: BoardVisit;
  laneId: string;
  style: React.CSSProperties;
  height: number;
  mode: "crew" | "person";
  dragging: boolean;
  onOpen: (visit: BoardVisit) => void;
}) {
  const movable = visit.status === "scheduled";
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `${visit.id}::${laneId}`, data: { visitId: visit.id, laneId }, disabled: !movable });
  const card = (
    <CalendarEvent start={visit.start} end={visit.end} client={visit.clientName} crew={peopleLine(visit, mode)} status={visit.status} height={height} className="h-full w-full" />
  );
  if (!movable) {
    return (
      <div className="absolute" style={style}>
        {card}
      </div>
    );
  }
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
      className={cn("absolute cursor-grab touch-none rounded-sm active:cursor-grabbing", dragging && "opacity-35")}
      style={style}
    >
      {card}
    </div>
  );
}

/**
 * Desktop day board: a time grid, 7 AM to 9 PM New York time, one column per
 * lane. Visits are sized by duration; overlapping visits share their lane.
 * Lanes accept drops (the DndContext lives in ScheduleClient). Scrolls inside
 * its frame with sticky lane headers and time column, and opens on the
 * current time (today) or the first visit.
 */
export function DayBoard({
  date,
  lanes,
  mode,
  now,
  draggingId,
  onOpen,
}: {
  date: string;
  lanes: Lane[];
  mode: "crew" | "person";
  now: Date | null;
  draggingId: string | null;
  onOpen: (visit: BoardVisit) => void;
}) {
  const marks = hourMarks(date);
  const nowPlace = now ? placeInDay(date, now, new Date(now.getTime() + 60000)) : null;
  const firstTop = lanes
    .flatMap((l) => l.visits)
    .map((v) => placeInDay(date, v.start, v.end)?.top)
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b)[0];
  const scrollTarget = nowPlace ? nowPlace.top * BOARD_HEIGHT : firstTop !== undefined ? firstTop * BOARD_HEIGHT : null;

  return (
    <BoardScroller
      targetPx={scrollTarget}
      headerPx={HEADER_PX}
      className="max-h-[calc(100dvh-19rem)] min-h-[480px] overflow-auto rounded-md border glass-solid shadow-e1"
    >
      <div className="relative grid min-w-full" style={{ gridTemplateColumns: `${TIME_COL}px repeat(${lanes.length}, minmax(210px, 1fr))` }}>
        {nowPlace && (
          <div className="pointer-events-none absolute z-10" style={{ left: TIME_COL, right: 0, top: HEADER_PX }}>
            <CalendarNowLine top={nowPlace.top * BOARD_HEIGHT} label={formatNyTime(now as Date)} />
          </div>
        )}
        <div className="sticky top-0 left-0 z-30 h-14 border-r border-b border-hairline glass" />
        {lanes.map((lane) => (
          <div key={lane.id} className="sticky top-0 z-20 h-14 border-r border-b border-hairline px-3 py-2 last:border-r-0 glass">
            <div className={cn("truncate text-sm font-medium", lane.kind === "unassigned" ? "text-warning" : "text-ink")}>{lane.label}</div>
            <div className="text-[12px] text-ink-muted tabular">
              {lane.visits.length} visit{lane.visits.length === 1 ? "" : "s"}
            </div>
          </div>
        ))}

        <div className="sticky left-0 z-10 border-r border-hairline bg-surface" style={{ height: BOARD_HEIGHT }}>
          {marks.slice(0, -1).map((m, i) => (
            <div key={m.label} className={cn("absolute right-2 text-[11px] text-ink-muted tabular", i === 0 ? "mt-1" : "-translate-y-2")} style={{ top: `${m.fraction * 100}%` }}>
              {m.label}
            </div>
          ))}
        </div>

        {lanes.map((lane) => {
          const columns = layoutColumns(lane.visits);
          return (
            <LaneColumn key={lane.id} lane={lane}>
              {marks.map((m) => (
                <div key={m.label} aria-hidden className="absolute inset-x-0 border-t border-hairline" style={{ top: `${m.fraction * 100}%` }} />
              ))}
              {lane.visits.map((v) => {
                const place = placeInDay(date, v.start, v.end);
                if (!place) return null;
                const col = columns.get(v.id) ?? { column: 0, columns: 1 };
                const height = Math.max(32, place.height * BOARD_HEIGHT - 2);
                return (
                  <VisitCard
                    key={v.id}
                    visit={v}
                    laneId={lane.id}
                    height={height}
                    mode={mode}
                    dragging={draggingId === `${v.id}::${lane.id}`}
                    onOpen={onOpen}
                    style={{
                      top: place.top * BOARD_HEIGHT + 1,
                      height,
                      left: `calc(${(col.column / col.columns) * 100}% + 3px)`,
                      width: `calc(${100 / col.columns}% - 6px)`,
                    }}
                  />
                );
              })}
            </LaneColumn>
          );
        })}
      </div>
    </BoardScroller>
  );
}

/** Phone list: visits grouped by lane in time order, each with a large Reassign button. */
export function VisitList({ lanes, mode, onOpen }: { lanes: Lane[]; mode: "crew" | "person"; onOpen: (visit: BoardVisit) => void }) {
  const shown = lanes.filter((l) => l.visits.length > 0 || l.kind === "unassigned");
  return (
    <div className="space-y-5">
      {shown.map((lane) => (
        <section key={lane.id} aria-label={lane.label}>
          <h2 className="mb-2 flex items-center justify-between px-1">
            <span className={cn("font-heading text-lg font-medium", lane.kind === "unassigned" ? "text-warning" : "text-ink")}>{lane.label}</span>
            <span className="text-[13px] text-ink-muted tabular">{lane.visits.length}</span>
          </h2>
          {lane.visits.length === 0 ? (
            <p className="rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-muted">Nothing unassigned.</p>
          ) : (
            <ul className="space-y-2">
              {lane.visits.map((v) => (
                <li key={`${lane.id}:${v.id}`} className="space-y-1.5">
                  <CalendarEvent start={v.start} end={v.end} client={v.clientName} crew={peopleLine(v, mode)} status={v.status} height={96} className="min-h-16 py-2.5" />
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
      ))}
    </div>
  );
}
