import { z } from "zod";

// The webhook contract, and the GHL API responses we read. GHL's responses vary a little
// between endpoints and accounts, so these are lenient about extra and missing fields and
// strict about what we act on (ids, times, stage).

const id = z.string().min(1).max(100);

/**
 * What our GHL workflows post. It is a notification only: the server fetches the record by id
 * and acts on that, never on this body. `eventId` must be unique per event and `sentAt` is when
 * the workflow fired (ISO text or epoch seconds/milliseconds), used for the replay window.
 */
export const notificationSchema = z.object({
  event: z.enum(["contact", "message", "opportunity", "appointment"]),
  eventId: z.string().min(8).max(200),
  sentAt: z.union([z.string().min(1), z.number()]),
  locationId: id.optional(),
  contactId: id.optional(),
  messageId: id.optional(),
  opportunityId: id.optional(),
  appointmentId: id.optional(),
}).superRefine((n, ctx) => {
  const needed = { contact: n.contactId, message: n.messageId, opportunity: n.opportunityId, appointment: n.appointmentId }[n.event];
  if (!needed) ctx.addIssue({ code: "custom", path: [`${n.event}Id`], message: `${n.event}Id is required for a ${n.event} event` });
});
export type Notification = z.infer<typeof notificationSchema>;

/** Epoch seconds, epoch milliseconds or an ISO string -> a Date, or null. */
export function parseSentAt(value: string | number): Date | null {
  const n = typeof value === "number" ? value : /^\d+$/.test(value.trim()) ? Number(value) : null;
  const d = n !== null ? new Date(n < 1e12 ? n * 1000 : n) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const REPLAY_WINDOW_MS = 5 * 60 * 1000;
export function withinReplayWindow(sentAt: Date, now: Date, windowMs = REPLAY_WINDOW_MS): boolean {
  return Math.abs(now.getTime() - sentAt.getTime()) <= windowMs;
}

const text = z.string().nullish().transform((v) => v ?? null);

const attributionSchema = z.object({
  utmSource: text, utmMedium: text, utmCampaign: text, utmContent: text, utmTerm: text,
  source: text, medium: text, campaign: text, isFirst: z.boolean().nullish(),
}).passthrough();

export const ghlContactSchema = z.object({
  id,
  firstName: text, lastName: text, phone: text, email: text, source: text,
  tags: z.array(z.string()).nullish().transform((v) => v ?? []),
  dnd: z.boolean().nullish().transform((v) => v ?? false),
  dndSettings: z.record(z.string(), z.object({ status: z.string().nullish() }).passthrough()).nullish(),
  attributions: z.array(attributionSchema).nullish().transform((v) => v ?? []),
  dateAdded: text, dateUpdated: text,
}).passthrough();
export type GhlContact = z.infer<typeof ghlContactSchema>;

export const ghlMessageSchema = z.object({
  id, contactId: text, conversationId: text, body: text, direction: z.string().nullish(),
  messageType: text, source: text, status: text, dateAdded: text,
}).passthrough();
export type GhlMessage = z.infer<typeof ghlMessageSchema>;

export const ghlOpportunitySchema = z.object({
  id, contactId: text, pipelineId: text, pipelineStageId: text, status: text, name: text, source: text,
  lostReason: text, dateUpdated: text, lastStageChangeAt: text,
}).passthrough();
export type GhlOpportunity = z.infer<typeof ghlOpportunitySchema>;

export const ghlAppointmentSchema = z.object({
  id, contactId: text, startTime: text, endTime: text, appointmentStatus: text, status: text,
}).passthrough();
export type GhlAppointment = z.infer<typeof ghlAppointmentSchema>;

// Endpoints answer either the bare record or { <name>: record }.
export function unwrap<T extends z.ZodType>(schema: T, key: string, json: unknown): z.infer<T> | null {
  const wrapped = z.object({ [key]: schema }).safeParse(json);
  if (wrapped.success) return (wrapped.data as Record<string, z.infer<T>>)[key] ?? null;
  const bare = schema.safeParse(json);
  return bare.success ? bare.data : null;
}
