import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendGhlSms } from "@/lib/ghl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ghl/send-sms
 *
 * Sends a manual SMS to a GHL contact from MAKI Ops, so the team doesn't
 * have to open GHL's UI just to text a lead. Auth is the normal Supabase
 * session (this route sits behind the app's auth middleware); we also check
 * the session directly here since it mutates a third-party system.
 *
 * Body: { ghlContactId: string, message: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ghlContactId, message } = (body ?? {}) as {
    ghlContactId?: unknown;
    message?: unknown;
  };

  if (typeof ghlContactId !== "string" || !ghlContactId.trim()) {
    return NextResponse.json({ error: "ghlContactId is required" }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await sendGhlSms(ghlContactId, message.trim());
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const description = err instanceof Error ? err.message : "Failed to send SMS";
    return NextResponse.json({ error: description }, { status: 502 });
  }
}
