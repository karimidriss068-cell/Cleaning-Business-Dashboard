import { cn } from "@/lib/utils";
import { hourMarks, layoutColumns, placeInDay } from "@/lib/dispatch";
import { shortName, type Lane } from "@/lib/schedule-lanes";
import { CalendarEvent, CalendarNowLine } from "@/components/system/calendar-event";
import { formatNyTime } from "@/lib/format";
import { BoardScroller } from "./board-scroller";

export const HOUR_PX = 60;
const WINDOW_HOURS = 14;
const BOARD_HEIGHT = HOUR_PX * WINDOW_HOURS;
const TIME_COL = 56;
const HEADER_PX = 57; // 56px header + 1px border

/**
 * Desktop day board (read-only): a time grid, 7 AM to 9 PM New York time, one
 * column per lane. Visits are sized by duration; overlapping visits share
 * their lane side by side. Scrolls inside its frame with sticky lane headers
 * and a sticky time column. `now` draws the live time line on today.
 */
export function DayBoard({ date, lanes, mode, now }: { date: string; lanes: Lane[]; mode: "crew" | "person"; now: Date | null }) {
  const marks = hourMarks(date);
  const nowPlace = now ? placeInDay(date, now, new Date(now.getTime() + 60000)) : null;
  const firstTop = lanes.flatMap((l) => l.visits).map((v) => placeInDay(date, v.start, v.end)?.top).filter((t): t is number => t !== undefined).sort((a, b) => a - b)[0];
  const scrollTarget = nowPlace ? nowPlace.top * BOARD_HEIGHT : firstTop !== undefined ? firstTop * BOARD_HEIGHT : null;

  return (
    <BoardScroller targetPx={scrollTarget} headerPx={HEADER_PX} className="max-h-[calc(100dvh-19rem)] min-h-[480px] overflow-auto rounded-md border border-hairline bg-surface surface-layer shadow-e1">
      <div className="relative grid min-w-full" style={{ gridTemplateColumns: `${TIME_COL}px repeat(${lanes.length}, minmax(210px, 1fr))` }}>
        {nowPlace && (
          <div className="pointer-events-none absolute z-10" style={{ left: TIME_COL, right: 0, top: HEADER_PX }}>
            <CalendarNowLine top={nowPlace.top * BOARD_HEIGHT} label={formatNyTime(now as Date)} />
          </div>
        )}
        {/* Header row */}
        <div className="sticky top-0 left-0 z-30 h-14 border-r border-b border-hairline glass" />
        {lanes.map((lane) => (
          <div key={lane.id} className="sticky top-0 z-20 h-14 border-r border-b border-hairline px-3 py-2 last:border-r-0 glass">
            <div className={cn("truncate text-sm font-medium", lane.kind === "unassigned" ? "text-warning" : "text-ink")}>{lane.label}</div>
            <div className="text-[12px] text-ink-muted tabular">
              {lane.visits.length} visit{lane.visits.length === 1 ? "" : "s"}
            </div>
          </div>
        ))}

        {/* Time column */}
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
            <div key={lane.id} className="relative border-r border-hairline last:border-r-0" style={{ height: BOARD_HEIGHT }}>
              {marks.map((m) => (
                <div key={m.label} aria-hidden className="absolute inset-x-0 border-t border-hairline" style={{ top: `${m.fraction * 100}%` }} />
              ))}
              {lane.visits.map((v) => {
                const place = placeInDay(date, v.start, v.end);
                if (!place) return null;
                const col = columns.get(v.id) ?? { column: 0, columns: 1 };
                const height = Math.max(32, place.height * BOARD_HEIGHT - 2);
                return (
                  <CalendarEvent
                    key={v.id}
                    start={v.start}
                    end={v.end}
                    client={v.clientName}
                    crew={mode === "crew" ? v.people.map((p) => shortName(p.name)).join(", ") || undefined : v.crewName ?? undefined}
                    status={v.status}
                    height={height}
                    className="absolute"
                    style={{
                      top: place.top * BOARD_HEIGHT + 1,
                      height,
                      left: `calc(${(col.column / col.columns) * 100}% + 3px)`,
                      width: `calc(${100 / col.columns}% - 6px)`,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </BoardScroller>
  );
}

/** Phone list (read-only): visits grouped by lane, in time order. */
export function VisitList({ lanes, mode }: { lanes: Lane[]; mode: "crew" | "person" }) {
  const nonEmpty = lanes.filter((l) => l.visits.length > 0 || l.kind === "unassigned");
  return (
    <div className="space-y-5">
      {nonEmpty.map((lane) => (
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
                <li key={v.id}>
                  <CalendarEvent
                    start={v.start}
                    end={v.end}
                    client={v.clientName}
                    crew={mode === "crew" ? v.people.map((p) => shortName(p.name)).join(", ") || undefined : v.crewName ?? undefined}
                    status={v.status}
                    height={96}
                    className="min-h-16 py-2.5"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
