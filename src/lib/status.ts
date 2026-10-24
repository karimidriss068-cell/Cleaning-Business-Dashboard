// Status -> pill tone (DESIGN.md section 2, "Status mapping"). "secondary" is
// the direction's second accent (accent2). Pure so every
// screen maps statuses the same way, and tested in status.test.ts.

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "secondary";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_access";
export type LeadStage = "new" | "contacted" | "quoted" | "won" | "lost";
export type InvoiceStatus = "draft" | "open" | "paid" | "void" | "uncollectible";
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
  contacted: "neutral",
  quoted: "secondary",
  won: "success",
  lost: "neutral",
};
const payoutTones: Record<PayoutStatus, Tone> = {
  draft: "neutral",
  approved: "info",
  paid: "success",
  void: "neutral",
};

export const jobTone = (s: JobStatus): Tone => jobTones[s];
export const leadTone = (s: LeadStage): Tone => leadTones[s];
export const payoutTone = (s: PayoutStatus): Tone => payoutTones[s];

/** Overdue is derived: an open invoice whose due date (NY calendar) has passed. */
export function invoiceTone(status: InvoiceStatus, dueOn: string | null, today: string): Tone {
  if (status === "open" && dueOn !== null && dueOn < today) return "danger";
  return { draft: "neutral", open: "info", paid: "success", void: "neutral", uncollectible: "danger" }[status] as Tone;
}
export function invoiceLabel(status: InvoiceStatus, dueOn: string | null, today: string): string {
  if (status === "open" && dueOn !== null && dueOn < today) return "Overdue";
  return { draft: "Draft", open: "Open", paid: "Paid", void: "Void", uncollectible: "Uncollectible" }[status];
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
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};
