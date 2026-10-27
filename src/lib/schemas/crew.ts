import { z } from "zod";
import { PHOTO_TYPES } from "@/lib/crew";

const uuid = z.string().uuid();
const photoExt = ["jpg", "png", "webp", "heic", "heif"] as const;

/** One row of crew_visits() (bigint columns arrive as numbers). */
export const crewVisitSchema = z.object({
  job_id: uuid,
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "no_access"]),
  service_name: z.string(),
  client_name: z.string(),
  address_line1: z.string(),
  address_line2: z.string().nullable(),
  borough: z.string().nullable(),
  zip: z.string(),
  access_instructions: z.string().nullable(),
  crew_notes: z.string().nullable(),
  my_pay_cents: z.number().nullable(),
  pay_pending: z.boolean(),
  teammates: z.array(z.string()),
  checklist_done: z.number(),
  checklist_total: z.number(),
  photo_count: z.number(),
});
export type CrewVisit = z.infer<typeof crewVisitSchema>;

/** crew_visit_detail() */
export const crewVisitDetailSchema = z.object({
  job_id: uuid,
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled", "no_access"]),
  completed_at: z.string().nullable(),
  service_name: z.string(),
  client_name: z.string(),
  address_line1: z.string(),
  address_line2: z.string().nullable(),
  borough: z.string().nullable(),
  zip: z.string(),
  access_instructions: z.string().nullable(),
  crew_notes: z.string().nullable(),
  my_pay_cents: z.number().nullable(),
  teammates: z.array(z.string()),
  checklist: z.array(z.object({ id: uuid, label: z.string(), done_at: z.string().nullable() })),
  note: z.string(),
});
export type CrewVisitDetail = z.infer<typeof crewVisitDetailSchema>;

export const crewMeSchema = z.object({ display_name: z.string(), coi_expires_on: z.string().nullable() });

// Server action inputs ---------------------------------------------------

export const toggleChecklistSchema = z.object({ itemId: uuid, done: z.boolean() });
export const saveNoteSchema = z.object({ jobId: uuid, note: z.string().max(2000) });
export const completeVisitSchema = z.object({ jobId: uuid });
export const registerPhotoSchema = z
  .object({
    jobId: uuid,
    path: z.string().max(200),
    kind: z.enum(["before", "after", "issue"]),
    contentType: z.enum(PHOTO_TYPES),
  })
  .refine((v) => new RegExp(`^${v.jobId}/[A-Za-z0-9-]+\\.(${photoExt.join("|")})$`).test(v.path), { message: "Invalid photo path", path: ["path"] });

export type CompleteResult =
  | { ok: true }
  | { ok: false; code: "too_early" | "closed" | "forbidden" | "error"; message: string };

/** complete_job's errors -> a code and a message safe to show. */
export function mapCompleteError(error: { code?: string; message?: string }): Extract<CompleteResult, { ok: false }> {
  const message = error.message ?? "";
  if (error.code === "42501") return { ok: false, code: "forbidden", message: "This visit isn't assigned to you." };
  if (/more than 1 hour before/.test(message)) return { ok: false, code: "too_early", message: "It's too early to complete this visit." };
  if (/cannot be completed from status/.test(message)) return { ok: false, code: "closed", message: "This visit can't be completed anymore." };
  return { ok: false, code: "error", message: "Couldn't complete the visit. Try again." };
}
