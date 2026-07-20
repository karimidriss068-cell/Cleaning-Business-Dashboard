import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { recordJobReply } from "@/lib/job-followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/job-followup-reply
 *
 * Called by a GHL workflow (Customer Replied -> Webhook) when a lead texts
 * back after the job-closed follow-up SMS.
 *
 * Body (GHL's raw Customer Replied webhook payload — same shape fixed for
 * /api/insights/sms after its Custom Data merge tag turned out to resolve
 * empty; applying the same fix here up front rather than waiting to
 * rediscover it):
 *   {
 *     contact_id: string,
 *     message: { type: number, body: string },   // the actual reply text
 *     customData?: { contact_id?: string, question?: string, message?: string }
 *   }
 *
 * The reply text is read from the top-level `message.body` first — GHL's
 * real reply text, always present on a Customer Replied trigger — falling
 * back to customData.question or customData.message only if that's
 * missing. contact_id prefers the top-level field too, falling back to
 * customData.contact_id. A Custom Data field wired to a merge tag like
 * {{contact.message_body}} can silently resolve to an empty string even
 * though it looks valid in the workflow UI, so top-level is the primary
 * source, not Custom Data, for both fields.
 *
 * Matches the reply to that contact's most recent appointment still
 * awaiting a reply and writes job_closed/job_revenue.
 *
 * No phone allowlist here (unlike /api/insights/sms, which grants access to
 * an internal AI assistant) — this only ever writes a boolean and a number
 * to the ONE appointment already waiting on that specific GHL contact, so
 * there's nothing sensitive to gate beyond the shared webhook secret.
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TEMP DEBUG LOGGING — remove once this trigger's real GHL payload shape
  // is confirmed against a few live requests. Reads the body as raw text
  // ONCE (a request body stream can only be consumed once), logs it, then
  // parses it as JSON from that same text.
  const rawText = await req.text();
  console.log("[job-reply-debug] content-type:", JSON.stringify(req.headers.get("content-type")));
  console.log("[job-reply-debug] raw body text:", JSON.stringify(rawText));

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : undefined;
    console.log("[job-reply-debug] parsed as JSON:", JSON.stringify(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contact_id, message, customData } = (body ?? {}) as {
    contact_id?: string;
    message?: { body?: string };
    customData?: { contact_id?: string; question?: string; message?: string };
  };
  const resolvedContactId = contact_id || customData?.contact_id;
  const resolvedMessage = message?.body || customData?.question || customData?.message;
  console.log(
    "[job-reply-debug] extracted fields:",
    JSON.stringify({ resolvedContactId, resolvedMessage }),
  );

  if (!resolvedContactId || !resolvedMessage?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: contact_id and message.body" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server not configured (missing service role key)" },
      { status: 500 },
    );
  }

  const result = await recordJobReply(supabase, resolvedContactId, resolvedMessage);
  if (!result) {
    return NextResponse.json({ matched: false });
  }
  return NextResponse.json({ matched: true, appointmentId: result.appointmentId, parsed: result.parsed });
}
