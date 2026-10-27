import { nyWallClock, nyWallTimeToUtc } from "@/lib/format";
import { checkAssignment, isBlocked, type Conflict, type CrewMember, type Slot } from "@/lib/dispatch";
import { UNASSIGNED_LANE, type BoardVisit, type LaneMode } from "@/lib/schedule-lanes";

/** What a move would set on a visit. */
export type Proposal = { crewId: string | null; personIds: string[]; start: Date; end: Date };

export type Roster = Map<string, CrewMember>;

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Slots (for conflict checks) of a cleaner's other visits. */
export function slotsFor(personId: string, visits: BoardVisit[], excludeId: string): Slot[] {
  return visits
    .filter((v) => v.id !== excludeId && (v.status === "scheduled" || v.status === "in_progress") && v.people.some((p) => p.id === personId))
    .map((v) => ({ id: v.id, start: v.start, end: v.end, borough: v.borough }));
}

/** Every conflict the proposal triggers for the cleaners it would assign. */
export function conflictsFor(visit: BoardVisit, proposal: Proposal, visits: BoardVisit[], roster: Roster): Conflict[] {
  const slot: Slot = { id: visit.id, start: proposal.start, end: proposal.end, borough: visit.borough };
  return proposal.personIds.flatMap((id) => {
    const person = roster.get(id);
    return person ? checkAssignment(slot, person, slotsFor(id, visits, visit.id)) : [];
  });
}

/** Active members of a crew, the default cleaners when a visit moves onto it. */
export function defaultPeopleForCrew(crewId: string | null, crewMembers: { crewId: string; subcontractorId: string }[], roster: Roster): string[] {
  if (!crewId) return [];
  return crewMembers.filter((m) => m.crewId === crewId && roster.get(m.subcontractorId)?.status === "active").map((m) => m.subcontractorId);
}

export type DropPlan = { kind: "apply" | "sheet" | "none"; proposal: Proposal; conflicts: Conflict[] };

/**
 * Decides what a drop does. A pure time move with nothing to warn about
 * applies at once; any crew or cleaner change, or any conflict, opens the
 * reassign sheet (prefilled) so the dispatcher confirms.
 */
export function planDrop(args: {
  visit: BoardVisit;
  mode: LaneMode;
  fromLaneId: string;
  toLaneId: string;
  newStart: Date;
  newEnd: Date;
  crewMembers: { crewId: string; subcontractorId: string }[];
  roster: Roster;
  visits: BoardVisit[];
}): DropPlan {
  const { visit, mode, fromLaneId, toLaneId, newStart, newEnd, crewMembers, roster, visits } = args;
  const current = visit.people.map((p) => p.id);
  let crewId = visit.crewId;
  let personIds = current;

  if (mode === "crew") {
    const target = toLaneId === UNASSIGNED_LANE ? null : toLaneId;
    if (target !== visit.crewId) {
      crewId = target;
      personIds = defaultPeopleForCrew(target, crewMembers, roster);
    }
  } else if (toLaneId === UNASSIGNED_LANE) {
    personIds = [];
  } else if (!current.includes(toLaneId)) {
    personIds = fromLaneId === UNASSIGNED_LANE ? [...current, toLaneId] : [...current.filter((id) => id !== fromLaneId), toLaneId];
  }

  const proposal: Proposal = { crewId, personIds, start: newStart, end: newEnd };
  const timeChanged = newStart.getTime() !== new Date(visit.start).getTime();
  const peopleChanged = !sameSet(personIds, current) || crewId !== visit.crewId;
  if (!timeChanged && !peopleChanged) return { kind: "none", proposal, conflicts: [] };

  const conflicts = conflictsFor(visit, proposal, visits, roster);
  return { kind: peopleChanged || conflicts.length > 0 ? "sheet" : "apply", proposal, conflicts };
}

/** The visit as it will look after a successful move (for the optimistic update). */
export function applyProposal(
  visit: BoardVisit,
  proposal: Proposal,
  crews: { id: string; name: string }[],
  roster: Roster,
): BoardVisit {
  return {
    ...visit,
    crewId: proposal.crewId,
    crewName: crews.find((c) => c.id === proposal.crewId)?.name ?? null,
    people: proposal.personIds.flatMap((id) => {
      const p = roster.get(id);
      return p ? [{ id, name: p.name }] : [];
    }),
    start: proposal.start.toISOString(),
    end: proposal.end.toISOString(),
  };
}

/** New start for a week-view drop: same New York time of day on another date. */
export function startOnDate(originalStart: string, date: string): Date {
  return nyWallTimeToUtc(date, nyWallClock(originalStart).time);
}

export { isBlocked };
