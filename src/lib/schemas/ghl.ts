import { z } from "zod";
import { TEMPLATE_KEYS } from "@/lib/ghl/send-rules";

// Inputs of the owner/admin GoHighLevel settings actions. The database checks them again.

const mode = z.enum(["dry_run", "live"]);
const optionalId = z.string().trim().max(100).transform((v) => v || null);

export const templateSchema = z.object({
  key: z.enum(TEMPLATE_KEYS),
  body: z.string().trim().min(1, "Write the message").max(600, "Keep it under 600 characters"),
  mode,
}).refine((t) => t.mode === "dry_run" || t.body.toUpperCase().includes("STOP"), {
  path: ["body"],
  message: "A live message must tell people they can reply STOP",
});

export const ghlSettingsSchema = z.object({
  pipelineId: optionalId,
  stageIds: z.object({ new: optionalId, contacted: optionalId, quoted: optionalId, won: optionalId, lost: optionalId }),
  opportunitySyncMode: mode,
  businessName: z.string().trim().min(1, "Enter the business name").max(80),
  maxPerContactPerDay: z.number().int().min(1, "At least 1").max(20, "At most 20"),
  maxPerHour: z.number().int().min(1, "At least 1").max(500, "At most 500"),
});

export const consentSchema = z.object({ contactId: z.string().uuid(), consent: z.boolean(), source: z.string().trim().max(60).optional() });
export const retrySchema = z.object({ id: z.string().uuid() });

/** What ghl_sync_status() returns. */
export const syncStatusSchema = z.object({
  failed: z.array(z.object({ kind: z.enum(["queue", "webhook", "message"]), id: z.string(), what: z.string(), status: z.string(), attempts: z.number(), error: z.string(), at: z.string() })),
  failedCount: z.number().int(),
  queue: z.object({ pending: z.number().int(), failed: z.number().int(), succeeded24h: z.number().int() }),
  recentMessages: z.array(z.object({ id: z.string(), template: z.string(), outcome: z.string(), reason: z.string().nullable(), at: z.string() })),
  lastWebhookAt: z.string().nullable(),
  lastReconcileAt: z.string().nullable(),
  lastReconcileNote: z.string().nullable(),
  webhooks24h: z.number().int(),
});
export type SyncStatus = z.infer<typeof syncStatusSchema>;
