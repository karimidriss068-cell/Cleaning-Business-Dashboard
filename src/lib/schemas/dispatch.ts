import { z } from "zod";

export const reassignInputSchema = z
  .object({
    jobId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    crewId: z.string().uuid().nullable(),
    subcontractorIds: z.array(z.string().uuid()).max(12),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    overrideReason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((v) => new Date(v.end).getTime() > new Date(v.start).getTime(), { message: "A visit must end after it starts", path: ["end"] });

export type ReassignInput = z.infer<typeof reassignInputSchema>;

export type ReassignResult =
  | { ok: true; updatedAt: string }
  | { ok: false; code: "invalid" | "stale" | "blocked" | "settled" | "not_movable" | "forbidden" | "error"; message: string };

/** Maps reassign_job's SQLSTATEs to a code and a message safe to show. */
export function mapReassignError(error: { code?: string; message?: string }): Extract<ReassignResult, { ok: false }> {
  const message = (error.message ?? "").replace(/^blocked: /, "");
  switch (error.code) {
    case "KC001":
      return { ok: false, code: "stale", message: "Someone else changed this visit. The board has been refreshed." };
    case "KC002":
      return { ok: false, code: "blocked", message };
    case "KC003":
      return { ok: false, code: "settled", message: "This visit is on an approved or paid payout and can't be changed." };
    case "KC004":
      return { ok: false, code: "not_movable", message };
    case "KC005":
      return { ok: false, code: "invalid", message };
    case "42501":
      return { ok: false, code: "forbidden", message: "Only office staff can move visits." };
    default:
      return { ok: false, code: "error", message: "Couldn't move the visit. Try again." };
  }
}
