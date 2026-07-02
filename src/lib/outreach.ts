import type { Tables, Enums } from "@/lib/supabase/database.types";

export type OutreachContact = Tables<"outreach_contacts">;
export type OutreachContactStatus = Enums<"outreach_contact_status">;
export type OutreachChannel = Enums<"outreach_channel">;

/** Ordered funnel stages (dead is terminal and sits outside the ladder). */
export const FUNNEL_STAGES = [
  "contacted",
  "replied",
  "call_booked",
  "call_held",
  "closed",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const STAGE_LABELS: Record<FunnelStage, string> = {
  contacted: "Contacted",
  replied: "Replied",
  call_booked: "Booked",
  call_held: "Held",
  closed: "Closed",
};

export const CONTACT_STATUS_LABELS: Record<OutreachContactStatus, string> = {
  contacted: "Contacted",
  replied: "Replied",
  call_booked: "Call booked",
  call_held: "Call held",
  closed: "Closed",
  dead: "Dead",
};

export const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  sms: "SMS",
  cold_call: "Cold call",
  dm: "DM",
  email: "Email",
};

// How far each status has progressed down the ladder. Everyone was "contacted"
// at minimum; "dead" only counts as having reached contacted.
const STATUS_RANK: Record<OutreachContactStatus, number> = {
  contacted: 0,
  replied: 1,
  call_booked: 2,
  call_held: 3,
  closed: 4,
  dead: 0,
};

export type Funnel = {
  contacted: number;
  replied: number;
  call_booked: number;
  call_held: number;
  closed: number;
  /** rates as a share of everyone contacted (top of funnel) */
  replyRate: number;
  callBookedRate: number;
  callHeldRate: number;
  closeRate: number;
};

/** Cumulative counts + rates across a set of contacts run through a script. */
export function computeFunnel(
  contacts: Pick<OutreachContact, "status">[],
): Funnel {
  const counts = { contacted: 0, replied: 0, call_booked: 0, call_held: 0, closed: 0 };
  for (const c of contacts) {
    const rank = STATUS_RANK[c.status];
    counts.contacted += 1; // every contact was reached
    if (rank >= 1) counts.replied += 1;
    if (rank >= 2) counts.call_booked += 1;
    if (rank >= 3) counts.call_held += 1;
    if (rank >= 4) counts.closed += 1;
  }
  const denom = counts.contacted || 0;
  const rate = (n: number) => (denom > 0 ? n / denom : 0);
  return {
    ...counts,
    replyRate: rate(counts.replied),
    callBookedRate: rate(counts.call_booked),
    callHeldRate: rate(counts.call_held),
    closeRate: rate(counts.closed),
  };
}

/** Median of a numeric array (returns null for empty). Robust to outliers. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
