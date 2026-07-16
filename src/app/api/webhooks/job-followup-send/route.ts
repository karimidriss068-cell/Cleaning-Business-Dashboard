import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret, verifyCronSecret } from "@/lib/webhook-auth";
import { sendJobFollowUps } from "@/lib/job-followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/webhooks/job-followup-send
 *
 * Triggered daily by Vercel Cron (see vercel.json — 14:00 UTC, GET request,
 * Vercel's own `authorization: Bearer $CRON_SECRET` auth — see
 * verifyCronSecret). Also still accepts the original `x-webhook-secret`
 * header this route shipped with, so a manual curl or an n8n workflow can
 * still trigger it the same way check-thresholds/insights-digest do —
 * either auth method is accepted, neither replaces the other.
 *
 * For every appointment whose scheduled date is JOB_FOLLOWUP_DELAY_DAYS+ in
 * the past with no job_closed answer yet: no-shows/cancellations are
 * auto-resolved as not-closed without texting anyone; appointments that
 * actually happened ('showed') get a one-time SMS asking whether it became
 * a job and roughly what it was worth, via the same GHL SMS integration
 * /api/insights/sms already uses (sendGhlSms).
 */
async function handle(req: NextRequest) {
  if (!verifyWebhookSecret(req) && !verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const result = await sendJobFollowUps(supabase);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
