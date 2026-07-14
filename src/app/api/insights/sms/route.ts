import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { askInsightsCore } from "@/lib/insights-ask";
import { resolveSmsUser } from "@/lib/insights-sms-allowlist";
import { sendGhlSms } from "@/lib/ghl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Anthropic (with thinking) + GHL's send-message call can together take
// longer than Vercel's default function timeout — GHL's own workflow is
// fire-and-forget on this route now, so nothing upstream enforces a shorter
// deadline for us. Raise it explicitly rather than risk a silent mid-flight kill.
export const maxDuration = 60;

/**
 * POST /api/insights/sms
 *
 * Called directly by a GHL workflow (Customer Replied -> phone filter ->
 * Webhook) when you text a question to the GHL number. Runs the question
 * through the same insights logic as the /insights chat UI (data snapshot,
 * anti-hallucination system prompt, monthly usage cap), then texts the
 * answer back itself via GHL's send-message API — GHL's workflow does not
 * need a downstream "Send SMS" step, since GHL's merge-tag picker has no
 * clean way to reference a webhook action's live response.
 *
 * Auth is the same shared secret as the other webhook routes (x-webhook-secret
 * must equal N8N_WEBHOOK_SECRET) PLUS a phone allowlist (INSIGHTS_SMS_ALLOWLIST)
 * — belt-and-suspenders in case the GHL trigger's own number scoping is ever
 * misconfigured, so a stranger texting the number can't get a free answer.
 *
 * Body: { phone: string, contact_id: string, question: string }
 * (contact_id is GHL's own contact id — required to call GHL's send-message
 * API; phone is only used for the allowlist check.)
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

  const { phone, contact_id, question } = (body ?? {}) as {
    phone?: string;
    contact_id?: string;
    question?: string;
  };
  if (!phone || !contact_id || !question?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields: phone, contact_id, and question" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const user = await resolveSmsUser(supabase, phone);
  if (!user) {
    return NextResponse.json({ error: "Phone number not authorized" }, { status: 403 });
  }

  const outcome = await askInsightsCore(supabase, user, question, { concise: true });

  const replyText =
    "result" in outcome
      ? outcome.result.answer
      : "limited" in outcome
        ? `Monthly insights limit reached (${outcome.used}/${outcome.cap}). Resets next month.`
        : // AI/config error — still text back something rather than leave the
          // sender hanging with no reply and no visible error.
          "Couldn't get an answer for that just now — try again shortly.";

  try {
    await sendGhlSms(contact_id, replyText);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Answer generated but SMS send failed: ${detail}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
