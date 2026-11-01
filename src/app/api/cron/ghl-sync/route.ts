import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronSecret } from "@/lib/webhook-auth";
import { createGhlClient, ghlConfig } from "@/lib/ghl/client";
import { drainQueue, reconcile, runOutbound } from "@/lib/ghl/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The reconciliation runs at most this often, however often the cron fires. */
const RECONCILE_EVERY_MS = 10 * 60_000;

/**
 * GET /api/cron/ghl-sync: Vercel Cron, every 5 minutes. Drains the GHL queue (stage updates,
 * retried texts, with backoff), finds the texts that are due and sends or dry-run logs them, and
 * reconciles with GHL to catch anything the webhooks missed. Every step is idempotent and runs
 * even if an earlier one fails. Without GHL credentials it still logs dry-run texts. Auth:
 * Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const config = ghlConfig();
  const client = config ? createGhlClient(config) : null;
  const now = new Date();
  const out: Record<string, unknown> = { configured: client !== null };
  let failed = false;

  const step = async (name: string, work: () => Promise<unknown>) => {
    try {
      out[name] = await work();
    } catch (e) {
      failed = true;
      out[name] = { error: e instanceof Error ? e.message.slice(0, 200) : "failed" };
    }
  };

  await step("queue", () => drainQueue(db, client, now));
  await step("outbound", () => runOutbound(db, client, now));
  if (client) {
    await step("reconcile", async () => {
      const { data } = await db.from("ghl_settings").select("last_reconcile_at").eq("id", true).single();
      const last = data?.last_reconcile_at ? Date.parse(data.last_reconcile_at) : 0;
      if (now.getTime() - last < RECONCILE_EVERY_MS) return { skipped: "ran recently" };
      return reconcile(db, client, now);
    });
  }
  return NextResponse.json(out, { status: failed ? 500 : 200 });
}
