import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { parseStageIds, type StageIds } from "@/lib/ghl/mapping";
import { syncStatusSchema, type SyncStatus } from "@/lib/schemas/ghl";
import type { TemplateKey } from "@/lib/ghl/send-rules";

export type TemplateRow = { key: TemplateKey; label: string; body: string; mode: "dry_run" | "live" };
export type GhlPageData = {
  /** Whether each environment value is present. The values themselves never leave the server. */
  env: { token: boolean; location: boolean; webhookSecret: boolean; cronSecret: boolean };
  settings: { pipelineId: string; stageIds: StageIds; opportunitySyncMode: "dry_run" | "live"; businessName: string; maxPerContactPerDay: number; maxPerHour: number };
  templates: TemplateRow[];
  status: SyncStatus;
};

export function ghlEnvFlags() {
  return {
    token: Boolean(process.env.GHL_API_TOKEN),
    location: Boolean(process.env.GHL_LOCATION_ID),
    webhookSecret: (process.env.GHL_WEBHOOK_SECRET ?? "").length >= 32,
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
}

/** Owner/admin only (the status function refuses anyone else). */
export async function loadSyncStatus(db: SupabaseClient<Database>): Promise<SyncStatus> {
  const { data, error } = await db.rpc("ghl_sync_status");
  if (error) throw new Error(`Loading the sync status failed: ${error.message}`);
  const parsed = syncStatusSchema.safeParse(data);
  if (!parsed.success) throw new Error("The sync status had an unexpected shape");
  return parsed.data;
}

export async function loadGhlPage(db: SupabaseClient<Database>): Promise<GhlPageData> {
  const [settingsRes, templatesRes, status] = await Promise.all([
    db.from("ghl_settings").select("pipeline_id, stage_ids, opportunity_sync_mode, business_name, max_texts_per_contact_per_day, max_texts_per_hour").eq("id", true).single(),
    db.from("message_templates").select("key, label, body, mode").order("key"),
    loadSyncStatus(db),
  ]);
  if (settingsRes.error) throw new Error(`Loading GHL settings failed: ${settingsRes.error.message}`);
  if (templatesRes.error) throw new Error(`Loading message templates failed: ${templatesRes.error.message}`);
  const s = settingsRes.data;
  const order: TemplateKey[] = ["instant_reply", "booking_confirmation", "reminder_24h", "review_request", "payment_link"];
  const templates = order.flatMap((key) => {
    const t = templatesRes.data.find((x) => x.key === key);
    return t ? [{ key, label: t.label, body: t.body, mode: t.mode === "live" ? ("live" as const) : ("dry_run" as const) }] : [];
  });
  return {
    env: ghlEnvFlags(),
    settings: {
      pipelineId: s.pipeline_id ?? "",
      stageIds: parseStageIds(s.stage_ids),
      opportunitySyncMode: s.opportunity_sync_mode === "live" ? "live" : "dry_run",
      businessName: s.business_name,
      maxPerContactPerDay: s.max_texts_per_contact_per_day,
      maxPerHour: s.max_texts_per_hour,
    },
    templates,
    status,
  };
}
