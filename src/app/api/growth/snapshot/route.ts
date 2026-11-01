import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGrowthSnapshotForBots } from "@/lib/growth-data";
import { verifyGrowthKey } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/growth/snapshot: the growth goal, pace, ad metrics, capacity, cash
 * and scale-light status as JSON, for Roast Room, Agents and the voice AI.
 * Read-only by construction: there is no other method, and the one database
 * function behind it only reads. Auth: Bearer GROWTH_API_KEY. Money is integer
 * cents; dates are America/New_York. `includesDemo` is true while demo data is loaded.
 */
export async function GET(req: NextRequest) {
  if (!process.env.GROWTH_API_KEY) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!verifyGrowthKey(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const snapshot = await loadGrowthSnapshotForBots(createAdminClient());
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load the growth numbers" }, { status: 500 });
  }
}
