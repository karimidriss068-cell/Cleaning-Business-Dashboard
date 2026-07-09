import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMetaSpend } from "@/lib/meta-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

/**
 * POST /api/meta/sync
 *
 * Pulls campaign-level spend/impressions/clicks from Meta's Insights API and
 * upserts it into spend_daily for campaigns mapped via meta_campaign_id.
 * Defaults to yesterday if no range is given.
 *
 * Body (optional): { since?: "YYYY-MM-DD", until?: "YYYY-MM-DD" }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const since = typeof body?.since === "string" ? body.since : isoDaysAgo(1);
  const until = typeof body?.until === "string" ? body.until : isoDaysAgo(1);

  try {
    const result = await syncMetaSpend(supabase, since, until);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const description = err instanceof Error ? err.message : "Meta sync failed";
    return NextResponse.json({ error: description }, { status: 502 });
  }
}
