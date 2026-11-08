// Status -> pill tone (DESIGN.md section 2, "Status mapping"). "secondary" is
// the direction's second accent (accent2). Pure so every
// screen maps statuses the same way, and tested in status.test.ts.

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "secondary";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_access";
export type LeadStage = "new" | "site_visit" | "quoted" | "follow_up" | "won" | "lost";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void" | "uncollectible";
export type PayoutStatus = "draft" | "approved" | "paid" | "void";

const jobTones: Record<JobStatus, Tone> = {
  scheduled: "info",
  in_progress: "info",
  completed: "success",
  no_access: "warning",
  cancelled: "neutral",
};
const leadTones: Record<LeadStage, Tone> = {
  new: "info",
  site_visit: "info",
  quoted: "secondary",
  follow_up: "warning",
  won: "success",
  lost: "neutral",
};
const payoutTones: Record<PayoutStatus, Tone> = {
  draft: "neutral",
  approved: "info",
  paid: "success",
  void: "neutral",
};

export const payoutLabel: Record<PayoutStatus, string> = { draft: "Draft", approved: "Approved", paid: "Paid", void: "Void" };
export const jobTone = (s: JobStatus): Tone => jobTones[s];
export const leadTone = (s: LeadStage): Tone => leadTones[s];
export const payoutTone = (s: PayoutStatus): Tone => payoutTones[s];

/**
 * Overdue is derived at display time as well as stored by the nightly job: a
 * sent or partially paid invoice whose NY due date has passed reads Overdue
 * immediately, even before the job has run.
 */
export function invoiceDisplayStatus(status: InvoiceStatus, dueOn: string | null, today: string): InvoiceStatus {
  if ((status === "sent" || status === "partially_paid") && dueOn !== null && dueOn < today) return "overdue";
  return status;
}
const invoiceTones: Record<InvoiceStatus, Tone> = {
  draft: "neutral",
  sent: "info",
  partially_paid: "secondary",
  paid: "success",
  overdue: "danger",
  void: "neutral",
  uncollectible: "danger",
};
export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  uncollectible: "Uncollectible",
};
export function invoiceTone(status: InvoiceStatus, dueOn: string | null, today: string): Tone {
  return invoiceTones[invoiceDisplayStatus(status, dueOn, today)];
}
export function invoiceLabel(status: InvoiceStatus, dueOn: string | null, today: string): string {
  return invoiceStatusLabel[invoiceDisplayStatus(status, dueOn, today)];
}

/** Insurance certificate: expired, expiring within 30 days, or valid. */
export function coiTone(expiresOn: string | null, today: string, in30Days: string): Tone {
  if (expiresOn === null) return "neutral";
  if (expiresOn < today) return "danger";
  if (expiresOn <= in30Days) return "warning";
  return "success";
}

export const jobLabel: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_access: "No access",
};
export const leadLabel: Record<LeadStage, string> = {
  new: "Lead",
  site_visit: "Site visit",
  quoted: "Bid sent",
  follow_up: "Follow-up",
  won: "Won",
  lost: "Lost",
};

// Growth goal: pace, capacity, cash, budget and the scale light. Always shown
// with a text label next to the dot (never color alone).
export type PaceState = "ahead" | "on_track" | "behind";
export const paceTone: Record<PaceState, Tone> = { ahead: "success", on_track: "info", behind: "warning" };
export const paceLabel: Record<PaceState, string> = { ahead: "Ahead of pace", on_track: "On track", behind: "Behind pace" };

export type ScaleState = "green" | "amber" | "red";
export const scaleTone: Record<ScaleState, Tone> = { green: "success", amber: "warning", red: "danger" };
export const scaleLabel: Record<ScaleState, string> = { green: "Green: safe to scale", amber: "Amber: hold steady", red: "Red: don't scale yet" };

export type ConditionTone = "ok" | "warn" | "fail" | "unknown";
export const conditionTone: Record<ConditionTone, Tone> = { ok: "success", warn: "warning", fail: "danger", unknown: "neutral" };
export const conditionLabel: Record<ConditionTone, string> = { ok: "OK", warn: "Close", fail: "Blocking", unknown: "No data" };

export const capacityTone: Record<"ok" | "warn" | "over", Tone> = { ok: "success", warn: "warning", over: "danger" };
export const capacityLabel: Record<"ok" | "warn" | "over", string> = { ok: "Room to grow", warn: "Near the limit", over: "Over capacity" };
export const budgetTone: Record<"under" | "near" | "over", Tone> = { under: "success", near: "warning", over: "danger" };
export const budgetLabel: Record<"under" | "near" | "over", string> = { under: "Within budget", near: "Close to budget", over: "Over budget" };
export const cashTone: Record<"ok" | "low" | "negative", Tone> = { ok: "success", low: "warning", negative: "danger" };
export const cashLabel: Record<"ok" | "low" | "negative", string> = { ok: "Above buffer", low: "At or under buffer", negative: "Below zero" };

// Automated texts and the GHL sync. A dry run is "info", never "success": nothing was sent.
export type MessageOutcome = "pending" | "sent" | "dry_run" | "blocked" | "failed";
export const messageOutcomeTone: Record<MessageOutcome, Tone> = { sent: "success", dry_run: "info", pending: "warning", blocked: "neutral", failed: "danger" };
export const messageOutcomeLabel: Record<MessageOutcome, string> = { sent: "Sent", dry_run: "Dry run", pending: "Sending", blocked: "Blocked", failed: "Failed" };
export function messageOutcome(value: string): MessageOutcome {
  return value in messageOutcomeTone ? (value as MessageOutcome) : "failed";
}

// Bids: draft -> ready -> sent -> won/lost/expired. Always shown with the word, never colour alone.
export type BidStatusKey = "draft" | "ready" | "sent" | "won" | "lost" | "expired";
export const bidLabel: Record<BidStatusKey, string> = { draft: "Draft", ready: "Ready to send", sent: "Sent", won: "Won", lost: "Lost", expired: "Expired" };
const bidTones: Record<BidStatusKey, Tone> = { draft: "neutral", ready: "info", sent: "secondary", won: "success", lost: "neutral", expired: "warning" };
export const bidTone = (s: BidStatusKey): Tone => bidTones[s];

// Projects: scheduled -> in progress -> completed (or cancelled).
export type ProjectStatusKey = "scheduled" | "in_progress" | "completed" | "cancelled";
export const projectLabel: Record<ProjectStatusKey, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const projectTones: Record<ProjectStatusKey, Tone> = { scheduled: "info", in_progress: "secondary", completed: "success", cancelled: "neutral" };
export const projectTone = (s: ProjectStatusKey): Tone => projectTones[s];
