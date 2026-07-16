import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { sendJobFollowUps } from "@/lib/job-followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/webhooks/job-followup-send (called daily by a scheduled n8n
 * workflow — same shared-secret pattern as check-thresholds/insights-digest).
 *
 * For every appointment whose scheduled date is JOB_FOLLOWUP_DELAY_DAYS+ in
 * the past with no job_closed answer yet: no-shows/cancellations are
 * auto-resolved as not-closed without texting anyone; appointments that
 * actually happened ('showed') get a one-time SMS asking whether it became
 * a job and roughly what it was worth, via the same GHL SMS integration
 * /api/insights/sms already uses (sendGhlSms).
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
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
