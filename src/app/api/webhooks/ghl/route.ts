import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGhlSecret } from "@/lib/webhook-auth";
import { createGhlClient, ghlConfig, GhlError } from "@/lib/ghl/client";
import { notificationSchema, parseSentAt, withinReplayWindow } from "@/lib/ghl/schemas";
import { handleNotification, runOutbound } from "@/lib/ghl/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10_000;

/**
 * POST /api/webhooks/ghl: notifications from this business's GoHighLevel workflows.
 *
 * GHL workflow webhooks can't sign the body, so this is the weaker "dedicated secret header"
 * guarantee from CLAUDE.md rule 1. The route compensates three ways: the body is a
 * NOTIFICATION ONLY (the record is re-fetched from GHL by id and that is what we act on, so a
 * forged or edited body can't write anything); the payload must carry a timestamp inside a
 * 5 minute replay window; and a repeated event id is answered 200 { duplicate: true } without
 * processing. The secret is long and random and compared in constant time. Order: header, raw
 * body once, zod, window, claim in webhook_events BEFORE any side effect, process, 2xx only
 * after the write commits and 5xx when GHL should retry. Ids are logged, never payloads.
 */
export async function POST(req: NextRequest) {
  if (!verifyGhlSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = ghlConfig();
  if (!config) return NextResponse.json({ error: "GHL is not configured" }, { status: 503 });

  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return NextResponse.json({ error: "Body too large" }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = notificationSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event", issues: parsed.error.flatten() }, { status: 400 });
  const n = parsed.data;
  if (n.locationId && n.locationId !== config.locationId) return NextResponse.json({ error: "Wrong location" }, { status: 400 });
  const sentAt = parseSentAt(n.sentAt);
  if (!sentAt || !withinReplayWindow(sentAt, new Date())) return NextResponse.json({ error: "Outside the replay window" }, { status: 400 });

  const db = createAdminClient();
  const claim = await db.from("webhook_events").insert({ provider: "ghl", event_id: n.eventId, payload_hash: createHash("sha256").update(raw).digest("hex") });
  if (claim.error) {
    if (claim.error.code !== "23505") return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
    // Seen before: a failed attempt is retried, anything else is a duplicate.
    const reclaim = await db
      .from("webhook_events")
      .update({ status: "received", error: null, received_at: new Date().toISOString() })
      .eq("provider", "ghl")
      .eq("event_id", n.eventId)
      .eq("status", "failed")
      .select("id");
    if (reclaim.error) return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
    if (!reclaim.data || reclaim.data.length === 0) return NextResponse.json({ duplicate: true });
  }

  const client = createGhlClient(config);
  try {
    const outcome = await handleNotification(db, client, n);
    await db.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "ghl").eq("event_id", n.eventId);
    await db.rpc("ghl_touch", { p_what: "webhook" });
    // A new lead is answered within a minute: send what is due right now instead of waiting for the cron.
    if (outcome.createdLead) {
      after(async () => {
        try {
          await runOutbound(db, client, new Date());
        } catch {
          // The cron picks it up; the failure is already visible in the sync status.
        }
      });
    }
    return NextResponse.json({ received: true, handled: outcome.handled });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "failed";
    await db.from("webhook_events").update({ status: "failed", error: message }).eq("provider", "ghl").eq("event_id", n.eventId);
    // A permanent GHL answer (bad id, no access) won't change on retry; anything else should be retried.
    const retry = !(e instanceof GhlError) || e.retryable;
    return NextResponse.json({ error: "Processing failed" }, { status: retry ? 500 : 422 });
  }
}
