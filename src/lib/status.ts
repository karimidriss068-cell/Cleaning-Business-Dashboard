// Status -> pill tone (DESIGN.md section 2, "Status mapping"). "secondary" is
// the direction's second accent (accent2). Pure so every
// screen maps statuses the same way, and tested in status.test.ts.

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "secondary";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_access";
export type LeadStage = "new" | "contacted" | "quoted" | "won" | "lost";
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
  new: "New",
  contacted: "Contacted",
  quoted: "Quote sent",
  won: "Booked",
  lost: "Lost",
};
