import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronSecret } from "@/lib/webhook-auth";
import { generateVisits } from "@/lib/visit-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/generate-visits — Vercel Cron, daily. Creates recurring
 * visits 8 weeks ahead (idempotent). Auth: authorization: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await generateVisits(createAdminClient());
    return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 500 });
  }
}
