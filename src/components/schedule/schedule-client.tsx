"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { formatNyDate, formatNyTime } from "@/lib/format";
import { instantAtFraction, isBlocked, type CrewMember } from "@/lib/dispatch";
import { applyProposal, planDrop, type Proposal, type Roster } from "@/lib/dispatch-move";
import { buildLanes, type BoardVisit, type LaneMode } from "@/lib/schedule-lanes";
import { reassignVisit } from "@/app/actions/dispatch";
import { CalendarEvent } from "@/components/system/calendar-event";
import { DayBoard, VisitList } from "./day-board";
import { ReassignSheet, type SheetState } from "./reassign-sheet";

type Props = {
  date: string;
  mode: LaneMode;
  now: string | null;
  initialVisits: BoardVisit[];
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
export function ScheduleClient({ date, mode, now, initialVisits, crews, roster: rosterList, crewMembers, isAdmin }: Props) {
  const router = useRouter();
  const [visits, setVisits] = useState(initialVisits);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dragging, setDragging] = useState<{ id: string; visitId: string; width: number; height: number } | null>(null);
  const startRef = useRef<{ top: number } | null>(null);
  const roster: Roster = useMemo(() => new Map(rosterList.map((p) => [p.id, p])), [rosterList]);
  const activePeople = useMemo(() => rosterList.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name })), [rosterList]);
  const lanes = useMemo(() => buildLanes(mode, visits, crews, activePeople), [mode, visits, crews, activePeople]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function commit(visit: BoardVisit, proposal: Proposal, overrideReason?: string) {
    const updated = applyProposal(visit, proposal, crews, roster);
    setVisits((vs) => vs.map((v) => (v.id === visit.id ? updated : v)));
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
      toast.success(`${visit.clientName} moved`, { description: `${updated.crewName ?? "Unassigned"} · ${formatNyDate(updated.start, "weekday")}, ${formatNyTime(updated.start)}` });
      return;
    }
    setVisits((vs) => vs.map((v) => (v.id === visit.id ? visit : v))); // roll back
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
    const data = e.active.data.current as { visitId: string; laneId: string } | undefined;
    const visit = visits.find((v) => v.id === data?.visitId);
    const laneEl = e.over ? document.querySelector<HTMLElement>(`[data-lane="${CSS.escape(String(e.over.id))}"]`) : null;
    if (!data || !visit || !e.over || !laneEl || !startRef.current) return;
    const rect = laneEl.getBoundingClientRect();
    const top = startRef.current.top + e.delta.y;
    const newStart = instantAtFraction(date, (top - rect.top) / rect.height);
    const duration = new Date(visit.end).getTime() - new Date(visit.start).getTime();
    const plan = planDrop({
      visit,
      mode,
      fromLaneId: data.laneId,
      toLaneId: String(e.over.id),
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

  const dragged = dragging ? visits.find((v) => v.id === dragging.visitId) : null;

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={false} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="hidden md:block">
          <DayBoard date={date} lanes={lanes} mode={mode} now={now ? new Date(now) : null} draggingId={dragging?.id ?? null} onOpen={openSheet} />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged && dragging ? (
            <div style={{ width: dragging.width, height: dragging.height }} className="rotate-[0.6deg] cursor-grabbing shadow-e3">
              <CalendarEvent start={dragged.start} end={dragged.end} client={dragged.clientName} status={dragged.status} height={dragging.height} className="h-full w-full" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <div className="md:hidden">
        <VisitList lanes={lanes} mode={mode} onOpen={openSheet} />
      </div>
      <ReassignSheet state={sheet} onClose={() => setSheet(null)} crews={crews} roster={roster} crewMembers={crewMembers} visits={visits} isAdmin={isAdmin} onSubmit={commit} />
    </>
  );
}
