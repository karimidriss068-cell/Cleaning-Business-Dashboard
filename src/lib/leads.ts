// Lead pipeline rules shared by the board, the server actions and the tests.
// The database enforces the same rules (move_lead_stage / convert_lead); this
// is what the screen uses to decide what to do before asking it.

import type { LeadStage } from "@/lib/status";

/** Board order. Stored values stay new/contacted/quoted/won/lost; labels are the business words. */
export const LEAD_STAGES: LeadStage[] = ["new", "contacted", "quoted", "won", "lost"];
export const OPEN_STAGES: LeadStage[] = ["new", "contacted", "quoted"];

export const stageLabel: Record<LeadStage, string> = { new: "New", contacted: "Contacted", quoted: "Quote sent", won: "Booked", lost: "Lost" };

export const SERVICE_TYPES = ["residential", "recurring", "move_out", "commercial"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export const serviceTypeLabel: Record<ServiceType, string> = { residential: "Residential", recurring: "Recurring", move_out: "Move-out", commercial: "Commercial" };

export const SOURCES = ["referral", "google", "instagram", "thumbtack", "walk_in", "other"] as const;
export type LeadSource = (typeof SOURCES)[number];
export const sourceLabel: Record<LeadSource, string> = { referral: "Referral", google: "Google", instagram: "Instagram", thumbtack: "Thumbtack", walk_in: "Walk-in", other: "Other" };

export const BOROUGHS = ["manhattan", "brooklyn", "queens", "bronx", "staten_island"] as const;
export const boroughLabel = (b: string) => b.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** US phone to E.164 (+1XXXXXXXXXX), or null. Mirrors private.normalize_us_phone. */
export function normalizeUsPhone(input: string | null | undefined): string | null {
  const d = (input ?? "").replace(/\D/g, "");
  if (/^[2-9]\d{9}$/.test(d)) return `+1${d}`;
  if (/^1[2-9]\d{9}$/.test(d)) return `+${d}`;
  return null;
}

/** +17185550142 -> (718) 555-0142. Anything else is returned as given. */
export function formatPhone(e164: string | null | undefined): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164 ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 ?? "");
}

export const normalizeEmail = (input: string | null | undefined): string | null => {
  const e = (input ?? "").trim().toLowerCase();
  return e === "" ? null : e;
};

export type StageMove =
  | { kind: "noop" }
  | { kind: "apply"; stage: LeadStage }
  | { kind: "needs_reason"; stage: "lost" };

/**
 * What a drop (or a Move menu pick) should do. Any stage can move to any
 * other, so a mis-drop is one move away from undone; Lost always asks why
 * first, because conversion reports depend on it.
 */
export function planStageMove(from: LeadStage, to: LeadStage): StageMove {
  if (from === to) return { kind: "noop" };
  if (to === "lost") return { kind: "needs_reason", stage: "lost" };
  return { kind: "apply", stage: to };
}

export type FollowUp = "none" | "overdue" | "today" | "upcoming";

/** Follow-up state for a lead on a New York calendar day. Closed leads never nag. */
export function followUpStatus(nextFollowUpOn: string | null, stage: LeadStage, today: string): FollowUp {
  if (!nextFollowUpOn || !OPEN_STAGES.includes(stage)) return "none";
  if (nextFollowUpOn < today) return "overdue";
  return nextFollowUpOn === today ? "today" : "upcoming";
}

export type SourceRow = { source: string; leads: number; booked: number; lost: number; open: number };

/** Booked share of leads that have been decided (booked + lost), in whole percent; null with none decided. */
export function winRatePercent(row: Pick<SourceRow, "booked" | "lost">): number | null {
  const decided = row.booked + row.lost;
  return decided === 0 ? null : Math.round((100 * row.booked) / decided);
}
