// The replay timeline ("4D"): one frame per New York day, built from real
// numbers on the server and scrubbed in the browser. Pure so it is testable.

import { addMonths, monthStartOf, paceForMonth, type Milestone, type PaceStatus } from "@/lib/growth";

export type ReplayFrame = {
  date: string;
  /** Revenue earned that day (invoiced plus completed visits not yet invoiced), cents. */
  dayCents: number;
  /** Revenue so far in that day's New York month, cents. */
  monthToDateCents: number;
  visits: number;
  newLeads: number;
  /** Pace for that day against its month's milestone; null when no milestone covers the month. */
  pace: { status: PaceStatus; daysAhead: number; expectedCents: number; milestoneCents: number } | null;
};

export type ReplayInputs = {
  /** Oldest first; must reach back to the first of the earliest frame's month. */
  daily: { day: string; cents: number }[];
  visitsByDay: Record<string, number>;
  leadsByDay: Record<string, number>;
  milestones: Milestone[];
  /** Number of frames to return, ending on the last day of `daily`. */
  frames: number;
};

export function buildReplay({ daily, visitsByDay, leadsByDay, milestones, frames }: ReplayInputs): ReplayFrame[] {
  const out: ReplayFrame[] = [];
  const mtd = new Map<string, number>();
  let runMonth = "";
  let run = 0;
  for (const d of daily) {
    const m = monthStartOf(d.day);
    if (m !== runMonth) {
      runMonth = m;
      run = 0;
    }
    run += d.cents;
    mtd.set(d.day, run);
  }
  for (const d of daily.slice(-frames)) {
    const ms = monthStartOf(d.day);
    const milestone = milestones.find((m) => m.monthStart === ms) ?? null;
    const monthToDateCents = mtd.get(d.day) ?? 0;
    const pace =
      milestone
        ? (() => {
            const p = paceForMonth({ today: d.day, monthStart: ms, nextMonthStart: addMonths(ms, 1), targetCents: milestone.targetCents, revenueCents: monthToDateCents });
            return { status: p.status, daysAhead: p.daysAhead, expectedCents: p.expectedToDateCents, milestoneCents: milestone.targetCents };
          })()
        : null;
    out.push({ date: d.day, dayCents: d.cents, monthToDateCents, visits: visitsByDay[d.day] ?? 0, newLeads: leadsByDay[d.day] ?? 0, pace });
  }
  return out;
}

/** Cumulative-in-window series for the replay chart. */
export const dayValues = (frames: ReplayFrame[]) => frames.map((f) => f.dayCents);
