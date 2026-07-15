import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRetellSecret } from "@/lib/webhook-auth";
import { askInsightsCore } from "@/lib/insights-ask";
import { resolveSmsUser, normalizePhone } from "@/lib/insights-sms-allowlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Anthropic (with thinking) can take a while; Retell is waiting live on the
// call for this response, so give it real headroom rather than risk a
// mid-flight timeout going quiet on the caller.
export const maxDuration = 60;

/**
 * POST /api/retell/query-insights
 *
 * Backs the "ask_maki_ops" Retell custom function. Retell's agent decides
 * mid-call when to invoke this (open-ended, not a fixed menu), sends the
 * caller's question, and speaks back whatever plain text this route returns.
 *
 * Request shape (confirmed against Retell's current docs — NOT "args only"
 * mode, since we need the caller's phone number from the `call` object,
 * which args-only mode strips):
 *   { name: string, call: { from_number, to_number, ... }, args: { question } }
 * If the custom function is left in "args only" mode, `call` is absent and
 * every request is treated as unauthorized (fails closed — see below).
 *
 * Response: Retell accepts a plain string, JSON, or buffer for a function
 * result and coerces it to text (200-299 = success, up to 15,000 chars) —
 * there's no required field name. A raw text/plain body is the least
 * ambiguous choice here, since a JSON envelope risks being read aloud
 * literally (braces and quotes) rather than spoken naturally.
 *
 * Auth: `x-retell-secret` header (RETELL_WEBHOOK_SECRET) is a hard gate —
 * wrong/missing secret is a real integration failure, returned as a normal
 * 401 JSON error (Retell isn't expected to speak this; it only happens if
 * the dashboard config is wrong). Caller-identity failures (phone missing or
 * not on the allowlist) are different: Retell only treats HTTP 200-299 as a
 * valid function result to speak, so those return 200 with a short spoken
 * decline instead of a 403 — a real 403 would make Retell silently fail to
 * relay any message to the caller at all.
 */
export async function POST(req: NextRequest) {
  if (!verifyRetellSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { call, args, question: topLevelQuestion } = (body ?? {}) as {
    call?: { from_number?: string };
    args?: { question?: string };
    question?: string;
  };

  const question = args?.question ?? topLevelQuestion;
  const fromNumber = call?.from_number;

  const supabase = createAdminClient();
  const myPhone = process.env.MY_PHONE_NUMBER;

  // TEMP DEBUG LOGGING — remove once the from_number question is settled.
  // Logs the full raw payload plus what we extracted/compared, so a real
  // Vercel log pull shows exactly what Retell actually sent, instead of us
  // guessing at the shape.
  console.log("[retell-debug] raw body:", JSON.stringify(body));
  console.log("[retell-debug] extracted fromNumber:", JSON.stringify(fromNumber));
  console.log("[retell-debug] MY_PHONE_NUMBER env value:", JSON.stringify(myPhone));
  console.log(
    "[retell-debug] normalized comparison:",
    JSON.stringify({
      fromNumberNormalized: fromNumber ? normalizePhone(fromNumber) : null,
      myPhoneNormalized: myPhone ? normalizePhone(myPhone) : null,
    }),
  );

  // Fail closed: no caller number in the payload (e.g. "args only" mode is
  // still on despite the setup instructions), no MY_PHONE_NUMBER configured,
  // or the numbers don't match — all treated the same, as "not authorized."
  const authorized =
    !!fromNumber &&
    !!myPhone &&
    normalizePhone(fromNumber) === normalizePhone(myPhone);

  console.log("[retell-debug] authorized:", authorized);

  if (!authorized) {
    return new NextResponse("This line isn't authorized for that.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const user = await resolveSmsUser(supabase, fromNumber!);
  if (!user) {
    return new NextResponse("This line isn't authorized for that.", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (!question?.trim()) {
    return NextResponse.json({ error: "Missing required field: question" }, { status: 400 });
  }

  const outcome = await askInsightsCore(supabase, user, question, {
    mode: "voice",
    callerPhone: fromNumber,
  });

  const replyText =
    "result" in outcome
      ? outcome.result.answer
      : "limited" in outcome
        ? `You've hit your monthly insights limit, ${outcome.used} out of ${outcome.cap}. It resets next month.`
        : // AI/config error — still say something rather than leave dead air.
          "I couldn't get an answer for that right now — try again in a moment.";

  return new NextResponse(replyText, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
