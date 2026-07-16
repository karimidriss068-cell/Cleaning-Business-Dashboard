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
 * back after the job-closed follow-up SMS. Same body shape and auth as
 * /api/insights/sms — this project's established GHL-reply-webhook contract:
 * { contact_id, message }. Matches the reply to that contact's most recent
 * appointment still awaiting a reply and writes job_closed/job_revenue.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contact_id, message } = (body ?? {}) as { contact_id?: string; message?: string };
  if (!contact_id || !message?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: contact_id and message" },
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

  const result = await recordJobReply(supabase, contact_id, message);
  if (!result) {
    return NextResponse.json({ matched: false });
  }
  return NextResponse.json({ matched: true, appointmentId: result.appointmentId, parsed: result.parsed });
}
