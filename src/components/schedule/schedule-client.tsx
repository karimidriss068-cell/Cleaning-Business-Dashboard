"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { formatNyDate, formatNyTime, nyDateString } from "@/lib/format";
import { instantAtFraction, isBlocked, type CrewMember } from "@/lib/dispatch";
import { applyProposal, planDrop, startOnDate, type Proposal, type Roster } from "@/lib/dispatch-move";
import { buildLanes, parseCellId, type BoardVisit, type LaneMode } from "@/lib/schedule-lanes";
import { reassignVisit } from "@/app/actions/dispatch";
import { CalendarEvent } from "@/components/system/calendar-event";
import { DayBoard, VisitList } from "./day-board";
import { WeekAgenda, WeekBoard } from "./week-board";
import { UnassignedTray, UnassignedTrayPhone } from "./unassigned-tray";
import type { Range } from "./board-toolbar";
import { ReassignSheet, type SheetState } from "./reassign-sheet";

type Props = {
  date: string;
  mode: LaneMode;
  range: Range;
  /** Monday to Sunday of the loaded week (week range only). */
  days: string[];
  today: string;
  now: string | null;
  /** Every loaded visit (the board's range plus the tray window), used for conflict checks. */
  initialVisits: BoardVisit[];
  initialTray: BoardVisit[];
  crews: { id: string; name: string }[];
  roster: CrewMember[];
  crewMembers: { crewId: string; subcontractorId: string }[];
  isAdmin: boolean;
};

/**
 * The interactive day schedule. Holds the visits in state so a move shows
 * instantly (optimistic) and is restored if the server refuses. Drag a card
 * to another lane or time; a pure time move with nothing to warn about applies
 * at once, anything else opens the Move sheet. Click or Enter on a card (or
 * Reassign on a phone) opens the same sheet.
 */
export function ScheduleClient({ date, mode, range, days, today, now, initialVisits, initialTray, crews, roster: rosterList, crewMembers, isAdmin }: Props) {
  const router = useRouter();
  const [visits, setVisits] = useState(initialVisits);
  const [tray, setTray] = useState(initialTray);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dragging, setDragging] = useState<{ id: string; visitId: string; width: number; height: number } | null>(null);
  const startRef = useRef<{ top: number } | null>(null);
  const roster: Roster = useMemo(() => new Map(rosterList.map((p) => [p.id, p])), [rosterList]);
  const activePeople = useMemo(() => rosterList.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name })), [rosterList]);
  // Lanes show only the board's own range; conflict checks use every loaded visit.
  const boardVisits = useMemo(
    () =>
      visits.filter((v) => {
        const d = nyDateString(v.start);
        return d >= days[0] && d <= days[days.length - 1];
      }),
    [visits, days],
  );
  const lanes = useMemo(() => buildLanes(mode, boardVisits, crews, activePeople), [mode, boardVisits, crews, activePeople]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function commit(visit: BoardVisit, proposal: Proposal, overrideReason?: string) {
    const updated = applyProposal(visit, proposal, crews, roster);
    const inTray = tray.some((t) => t.id === visit.id);
    setVisits((vs) => vs.map((v) => (v.id === visit.id ? updated : v)));
    // A visit that gets a cleaner leaves the tray; otherwise it just updates there.
    if (inTray) setTray((t) => (proposal.personIds.length > 0 ? t.filter((x) => x.id !== visit.id) : t.map((x) => (x.id === visit.id ? updated : x))));
    setSheet(null);
    const result = await reassignVisit({
      jobId: visit.id,
      expectedUpdatedAt: visit.updatedAt,
      crewId: proposal.crewId,
      subcontractorIds: proposal.personIds,
      start: proposal.start.toISOString(),
      end: proposal.end.toISOString(),
      overrideReason,
    });
    if (result.ok) {
      setVisits((vs) => vs.map((v) => (v.id === visit.id ? { ...v, updatedAt: result.updatedAt } : v)));
      if (inTray) setTray((t) => t.map((x) => (x.id === visit.id ? { ...x, updatedAt: result.updatedAt } : x)));
      toast.success(`${visit.clientName} moved`, { description: `${updated.crewName ?? "Unassigned"} · ${formatNyDate(updated.start, "weekday")}, ${formatNyTime(updated.start)}` });
      return;
    }
    setVisits((vs) => vs.map((v) => (v.id === visit.id ? visit : v))); // roll back
    if (inTray) setTray((t) => (t.some((x) => x.id === visit.id) ? t.map((x) => (x.id === visit.id ? visit : x)) : [...t, visit].sort((a, b) => a.start.localeCompare(b.start))));
    toast.error(result.code === "stale" ? "Visit changed by someone else" : "Move refused", { description: result.message });
    if (result.code === "stale") router.refresh();
  }

  function openSheet(visit: BoardVisit) {
    setSheet({
      visit,
      initial: { crewId: visit.crewId, personIds: visit.people.map((p) => p.id), start: new Date(visit.start), end: new Date(visit.end) },
    });
  }

  function onDragStart(e: DragStartEvent) {
    // dnd-kit's initial rect isn't reliable at drag start, so measure the card itself.
    const el = (e.activatorEvent.target as HTMLElement | null)?.closest<HTMLElement>("[data-visit-card]");
    const r = el?.getBoundingClientRect();
    startRef.current = r ? { top: r.top } : null;
    const data = e.active.data.current as { visitId: string } | undefined;
    setDragging(data ? { id: String(e.active.id), visitId: data.visitId, width: r?.width ?? 200, height: r?.height ?? 60 } : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const data = e.active.data.current as { visitId: string; laneId: string; source: "board" | "tray" } | undefined;
    const visit = visits.find((v) => v.id === data?.visitId) ?? tray.find((v) => v.id === data?.visitId);
    if (!data || !visit || !e.over) return;
    const cell = parseCellId(String(e.over.id));
    const toLaneId = cell ? cell.laneId : String(e.over.id);
    let newStart: Date;
    if (cell) {
      newStart = startOnDate(visit.start, cell.date); // week view: another day, same time of day
    } else if (data.source === "tray" && nyDateString(visit.start) !== date) {
      newStart = new Date(visit.start); // tray visit from another day: only the assignment changes
    } else {
      const laneEl = document.querySelector<HTMLElement>(`[data-lane="${CSS.escape(toLaneId)}"]`);
      if (!laneEl || !startRef.current) return;
      const rect = laneEl.getBoundingClientRect();
      newStart = instantAtFraction(date, (startRef.current.top + e.delta.y - rect.top) / rect.height);
    }
    const duration = new Date(visit.end).getTime() - new Date(visit.start).getTime();
    const plan = planDrop({
      visit,
      mode,
      fromLaneId: data.laneId,
      toLaneId,
      newStart,
      newEnd: new Date(newStart.getTime() + duration),
      crewMembers,
      roster,
      visits,
    });
    if (plan.kind === "apply") void commit(visit, plan.proposal);
    else if (plan.kind === "sheet") {
      // Open on the next tick: the drop's own pointer-up would otherwise count
      // as an outside click and close the sheet it just opened.
      window.setTimeout(() => {
        setSheet({ visit, initial: plan.proposal });
        if (isBlocked(plan.conflicts)) toast.warning("That move is blocked", { description: plan.conflicts.find((c) => c.severity === "block")?.message });
      }, 50);
    }
  }

  const dragged = dragging ? (visits.find((v) => v.id === dragging.visitId) ?? tray.find((v) => v.id === dragging.visitId)) : null;
  const weekView = range === "week";

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={false} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="hidden items-start gap-4 md:flex">
          <div className="min-w-0 flex-1">
            {weekView ? (
              <WeekBoard days={days} today={today} lanes={lanes} mode={mode} draggingId={dragging?.id ?? null} onOpen={openSheet} />
            ) : (
              <DayBoard date={date} lanes={lanes} mode={mode} now={now ? new Date(now) : null} draggingId={dragging?.id ?? null} onOpen={openSheet} />
            )}
          </div>
          <UnassignedTray visits={tray} draggingId={dragging?.id ?? null} onOpen={openSheet} />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged && dragging ? (
            <div style={{ width: dragging.width, height: dragging.height }} className="rotate-[0.6deg] cursor-grabbing shadow-e3">
              <CalendarEvent start={dragged.start} end={dragged.end} client={dragged.clientName} status={dragged.status} height={dragging.height} className="h-full w-full" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div className="space-y-5 md:hidden">
        <UnassignedTrayPhone visits={tray} onOpen={openSheet} />
        {weekView ? <WeekAgenda days={days} today={today} visits={boardVisits} mode={mode} onOpen={openSheet} /> : <VisitList lanes={lanes} mode={mode} onOpen={openSheet} />}
      </div>
      <ReassignSheet state={sheet} onClose={() => setSheet(null)} crews={crews} roster={roster} crewMembers={crewMembers} visits={visits} isAdmin={isAdmin} onSubmit={commit} />
    </>
  );
}
