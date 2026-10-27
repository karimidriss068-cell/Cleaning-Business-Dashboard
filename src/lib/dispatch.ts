import { addDays, nyDateString, nyWallTimeToUtc } from "@/lib/format";

export const DAY_START = "07:00";
export const DAY_END = "21:00";
export const SNAP_MINUTES = 15;
export const TRAVEL_BUFFER_MINUTES = 45;
export const COI_WARNING_DAYS = 30;

const MIN = 60000;

/** The visible window of a NY calendar day (7 AM to 9 PM), as UTC instants. */
export function dayWindow(date: string): { start: Date; end: Date } {
  return { start: nyWallTimeToUtc(date, DAY_START), end: nyWallTimeToUtc(date, DAY_END) };
}

/** Hour gridlines for a day, positioned by real elapsed time (so DST days stay correct). */
export function hourMarks(date: string): { label: string; fraction: number }[] {
  const { start, end } = dayWindow(date);
  const span = end.getTime() - start.getTime();
  const marks: { label: string; fraction: number }[] = [];
  for (let h = Number(DAY_START.slice(0, 2)); h <= Number(DAY_END.slice(0, 2)); h++) {
    const at = nyWallTimeToUtc(date, `${String(h).padStart(2, "0")}:00`);
    marks.push({ label: `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`, fraction: (at.getTime() - start.getTime()) / span });
  }
  return marks;
}

/**
 * Where a visit sits in the day window, as fractions of the window height.
 * Visits that start before or end after the window are clamped (flagged), and
 * a visit entirely outside it returns null.
 */
export function placeInDay(date: string, start: string | Date, end: string | Date) {
  const w = dayWindow(date);
  const span = w.end.getTime() - w.start.getTime();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (e <= w.start.getTime() || s >= w.end.getTime()) return null;
  const top = Math.max(s, w.start.getTime());
  const bottom = Math.min(e, w.end.getTime());
  return {
    top: (top - w.start.getTime()) / span,
    height: (bottom - top) / span,
    clippedStart: s < w.start.getTime(),
    clippedEnd: e > w.end.getTime(),
  };
}

/** The instant for a vertical drop position (0..1 of the window), snapped to 15 minutes. */
export function instantAtFraction(date: string, fraction: number): Date {
  const { start, end } = dayWindow(date);
  const clamped = Math.min(1, Math.max(0, fraction));
  return snapInstant(new Date(start.getTime() + clamped * (end.getTime() - start.getTime())));
}

/** Rounds to the nearest 15 minutes (New York offsets are whole quarter hours). */
export function snapInstant(d: Date, minutes = SNAP_MINUTES): Date {
  const step = minutes * MIN;
  return new Date(Math.round(d.getTime() / step) * step);
}

/** Moves a visit to a new start, keeping its duration. */
export function moveVisit(start: string | Date, end: string | Date, newStart: Date): { start: Date; end: Date } {
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return { start: newStart, end: new Date(newStart.getTime() + duration) };
}

export type Placed = { id: string; start: string; end: string };

/**
 * Side-by-side columns for overlapping visits in one lane. Each visit gets a
 * column index and the number of columns in its overlap cluster, so cards in a
 * cluster share the lane width equally.
 */
export function layoutColumns<T extends Placed>(visits: T[]): Map<string, { column: number; columns: number }> {
  const sorted = [...visits].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const result = new Map<string, { column: number; columns: number }>();
  let cluster: { id: string; column: number }[] = [];
  let clusterEnd = -Infinity;
  const columnEnds: number[] = [];

  const flush = () => {
    const columns = Math.max(1, columnEnds.length);
    for (const c of cluster) result.set(c.id, { column: c.column, columns });
    cluster = [];
    columnEnds.length = 0;
    clusterEnd = -Infinity;
  };

  for (const v of sorted) {
    const s = new Date(v.start).getTime();
    const e = new Date(v.end).getTime();
    if (cluster.length > 0 && s >= clusterEnd) flush();
    let col = columnEnds.findIndex((end) => end <= s);
    if (col === -1) col = columnEnds.length;
    columnEnds[col] = e;
    cluster.push({ id: v.id, column: col });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return result;
}

// ---------------------------------------------------------------- conflicts

export type ConflictKind = "double_booked" | "insurance_expired" | "inactive" | "insurance_expiring" | "travel" | "borough_not_covered";
export type Conflict = {
  kind: ConflictKind;
  /** "block" refuses the move unless an admin overrides; "warn" only informs. */
  severity: "block" | "warn";
  subcontractorId: string;
  message: string;
};

export type Slot = { id: string; start: string | Date; end: string | Date; borough: string | null };
export type CrewMember = {
  id: string;
  name: string;
  status: "onboarding" | "active" | "inactive";
  coiExpiresOn: string | null;
  boroughs: string[];
};

const t = (d: string | Date) => new Date(d).getTime();
const label = (b: string) => b.replace("_", " ");

/**
 * What putting `sub` on `visit` would trigger, given the cleaner's other
 * visits. The database enforces the blocking rules (reassign_job); this
 * mirrors them so the board can warn before the move and explain refusals.
 */
export function checkAssignment(visit: Slot, sub: CrewMember, others: Slot[]): Conflict[] {
  const out: Conflict[] = [];
  const date = nyDateString(new Date(visit.start));
  const add = (kind: ConflictKind, severity: Conflict["severity"], message: string) => out.push({ kind, severity, subcontractorId: sub.id, message });

  if (sub.status !== "active") add("inactive", "block", `${sub.name} isn't active`);
  if (sub.coiExpiresOn) {
    if (sub.coiExpiresOn < date) add("insurance_expired", "block", `${sub.name}'s insurance expired ${sub.coiExpiresOn}`);
    else if (sub.coiExpiresOn <= addDays(date, COI_WARNING_DAYS)) add("insurance_expiring", "warn", `${sub.name}'s insurance expires ${sub.coiExpiresOn}`);
  }
  if (visit.borough && sub.boroughs.length > 0 && !sub.boroughs.includes(visit.borough)) {
    add("borough_not_covered", "warn", `${sub.name} doesn't usually cover ${label(visit.borough)}`);
  }

  for (const o of others) {
    if (o.id === visit.id) continue;
    if (t(o.start) < t(visit.end) && t(visit.start) < t(o.end)) {
      add("double_booked", "block", `${sub.name} is already booked at that time`);
      continue;
    }
    const gap = t(visit.start) >= t(o.end) ? t(visit.start) - t(o.end) : t(o.start) - t(visit.end);
    if (gap < TRAVEL_BUFFER_MINUTES * MIN && visit.borough && o.borough && visit.borough !== o.borough) {
      add("travel", "warn", `${sub.name} has only ${Math.round(gap / MIN)} min between ${label(o.borough)} and ${label(visit.borough)}`);
    }
  }
  return out;
}

export const isBlocked = (conflicts: Conflict[]) => conflicts.some((c) => c.severity === "block");
