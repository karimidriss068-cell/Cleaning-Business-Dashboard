import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { askInsightsCore } from "@/lib/insights-ask";
import { resolveSmsUser } from "@/lib/insights-sms-allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/insights/sms
 *
 * Called by n8n after a GHL workflow captures an inbound SMS. Runs the
 * question through the same insights logic as the /insights chat UI (data
 * snapshot, anti-hallucination system prompt, monthly usage cap) and returns
 * a plain-text, SMS-length answer for n8n to hand to GHL's send-message action.
 *
 * Auth is the same shared secret as the other webhook routes (x-webhook-secret
 * must equal N8N_WEBHOOK_SECRET) PLUS a phone allowlist (INSIGHTS_SMS_ALLOWLIST)
 * — belt-and-suspenders in case the GHL trigger's own number scoping is ever
 * misconfigured, so a stranger texting the number can't get a free answer.
 *
 * Body: { phone: string, question: string }
 * Always responds 200 with { answer: string } for legitimate business
 * outcomes (real answer, over the monthly cap, AI request failed) so n8n's
 * happy path can wire straight to "send this text" without an error branch.
 * Only auth/validation failures return non-200 (401/400/403).
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

  const { phone, question } = (body ?? {}) as { phone?: string; question?: string };
  if (!phone || !question?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: phone and question" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const user = await resolveSmsUser(supabase, phone);
  if (!user) {
    return NextResponse.json({ error: "Phone number not authorized" }, { status: 403 });
  }

  const outcome = await askInsightsCore(supabase, user, question, { concise: true });

  if ("result" in outcome) {
    return NextResponse.json({ answer: outcome.result.answer });
  }
  if ("limited" in outcome) {
    return NextResponse.json({
      answer: `Monthly insights limit reached (${outcome.used}/${outcome.cap}). Resets next month.`,
    });
  }
  // AI/config error — still text back something rather than leave the
  // sender hanging with no reply and no visible error.
  return NextResponse.json({
    answer: "Couldn't get an answer for that just now — try again shortly.",
  });
}
