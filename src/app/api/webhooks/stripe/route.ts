import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature } from "@/lib/webhook-auth";
import { eventEnvelope, processStripeEvent } from "@/lib/stripe-events";
import { retrievePaymentIntent, retrieveSetupIntent } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe (TEST MODE only). Order matters (CLAUDE.md rule 1):
 * read the raw body once, verify Stripe's signature (HMAC, 5 minute tolerance),
 * parse with zod, claim the event in webhook_events BEFORE any side effect, then
 * process. A re-delivered event answers 200 { duplicate: true }; a transient
 * failure answers 500 so Stripe retries (a failed claim is re-claimed). The
 * payment writes are also idempotent on Stripe's own ids. No payloads or
 * customer details are logged.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = eventEnvelope.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event", issues: parsed.error.flatten() }, { status: 400 });
  }
  const event = parsed.data;
  if (event.livemode) {
    return NextResponse.json({ error: "Live-mode events are not accepted yet (test mode only)" }, { status: 400 });
  }

  const db = createAdminClient();
  const claim = await db
    .from("webhook_events")
    .insert({ provider: "stripe", event_id: event.id, payload_hash: createHash("sha256").update(raw).digest("hex") });
  if (claim.error) {
    if (claim.error.code !== "23505") return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
    // Already seen: a failed attempt is retried, anything else is a duplicate.
    const reclaim = await db
      .from("webhook_events")
      .update({ status: "received", error: null, received_at: new Date().toISOString() })
      .eq("provider", "stripe")
      .eq("event_id", event.id)
      .eq("status", "failed")
      .select("id");
    if (reclaim.error) return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
    if (!reclaim.data || reclaim.data.length === 0) return NextResponse.json({ duplicate: true });
  }

  try {
    const outcome = await processStripeEvent(db, event, { retrievePaymentIntent, retrieveSetupIntent });
    await db.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("event_id", event.id);
    return NextResponse.json({ received: true, handled: outcome.handled });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "failed";
    await db.from("webhook_events").update({ status: "failed", error: message }).eq("provider", "stripe").eq("event_id", event.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
