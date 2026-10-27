export type BoardVisit = {
  id: string;
  /** Concurrency token for reassign_job (the visit's updated_at). */
  updatedAt: string;
  start: string;
  end: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_access";
  clientName: string;
  serviceName: string;
  borough: string | null;
  priceCents: number;
  crewId: string | null;
  crewName: string | null;
  people: { id: string; name: string }[];
};

export type Lane = { id: string; label: string; sublabel?: string; visits: BoardVisit[]; kind: "crew" | "person" | "unassigned" };
export type LaneMode = "crew" | "person";

export const UNASSIGNED_LANE = "unassigned";

/**
 * Lanes for the day board. Crew mode: one lane per active crew, then
 * Unassigned (visits with no crew). Person mode: one lane per active cleaner
 * (a visit shows in each cleaner's lane), then Unassigned (nobody on it).
 * Free cleaners and crews still get a lane, so gaps are visible.
 */
export function buildLanes(
  mode: LaneMode,
  visits: BoardVisit[],
  crews: { id: string; name: string }[],
  people: { id: string; name: string }[],
): Lane[] {
  const byStart = (a: BoardVisit, b: BoardVisit) => a.start.localeCompare(b.start);
  if (mode === "crew") {
    const lanes: Lane[] = crews.map((c) => ({
      id: c.id,
      label: c.name,
      kind: "crew" as const,
      visits: visits.filter((v) => v.crewId === c.id).sort(byStart),
    }));
    lanes.push({ id: UNASSIGNED_LANE, label: "Unassigned", kind: "unassigned", visits: visits.filter((v) => v.crewId === null).sort(byStart) });
    return lanes;
  }
  const lanes: Lane[] = people.map((p) => ({
    id: p.id,
    label: p.name,
    kind: "person" as const,
    visits: visits.filter((v) => v.people.some((x) => x.id === p.id)).sort(byStart),
  }));
  lanes.push({ id: UNASSIGNED_LANE, label: "Unassigned", kind: "unassigned", visits: visits.filter((v) => v.people.length === 0).sort(byStart) });
  return lanes;
}

/** "Ana Ruiz" -> "Ana R." for tight cards. */
export function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}
