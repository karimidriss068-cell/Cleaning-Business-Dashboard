// Bid pipeline rules shared by the board, the drawer and the tests: what a stage is worth until the
// owner sets a number, the weighted value of open work, and how close a bid due date is. Pure.

import type { LeadStage } from "@/lib/status";
import { addDays, percentOfCents } from "@/lib/format";

/**
 * PLACEHOLDER chances of winning by stage, in basis points. Nobody has closed enough bids yet to know
 * the real rates; each opportunity can carry its own estimate, and the Win/loss numbers replace
 * these once there are at least MIN_CLOSED_BIDS_FOR_RATES closed bids.
 */
export const DEFAULT_WIN_BPS: Record<LeadStage, number> = {
  new: 1000,
  site_visit: 2000,
  quoted: 2500,
  follow_up: 3000,
  won: 10000,
  lost: 0,
};
export const MIN_CLOSED_BIDS_FOR_RATES = 10;

export type ValuedLead = { stage: LeadStage; expectedValueCents: number | null; winProbabilityBps: number | null };

/** The chance used for a lead: its own estimate if set, else the stage default. */
export const winProbabilityBps = (l: Pick<ValuedLead, "stage" | "winProbabilityBps">): number => l.winProbabilityBps ?? DEFAULT_WIN_BPS[l.stage];

/** Expected value times chance, in whole cents (rounded); 0 with no value. Closed leads weigh 0 here. */
export function weightedValueCents(l: ValuedLead): number {
  if (l.expectedValueCents === null || l.stage === "won" || l.stage === "lost") return 0;
  return percentOfCents(l.expectedValueCents, winProbabilityBps(l));
}

export const pipelineTotals = (leads: ValuedLead[]) => ({
  openValueCents: leads.reduce((t, l) => (l.stage === "won" || l.stage === "lost" ? t : t + (l.expectedValueCents ?? 0)), 0),
  weightedCents: leads.reduce((t, l) => t + weightedValueCents(l), 0),
});

export type BidDueState = "overdue" | "today" | "soon" | "later";
/** Days before the due date that count as "soon". */
export const BID_DUE_SOON_DAYS = 3;

/** A bid is only due while it hasn't gone out: Lead and Site visit. Dates are New York days (YYYY-MM-DD). */
export function bidDueState(dueOn: string | null, stage: LeadStage, today: string): BidDueState | null {
  if (!dueOn || (stage !== "new" && stage !== "site_visit")) return null;
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  return dueOn <= addDays(today, BID_DUE_SOON_DAYS) ? "soon" : "later";
}
