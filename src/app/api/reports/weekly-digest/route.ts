import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentWeekRange } from "@/lib/format";
import { computeFunnel, type OutreachContactStatus } from "@/lib/outreach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/weekly-digest  (called by a scheduled n8n workflow, Mondays)
 *
 * Guarded by x-webhook-secret. Returns a JSON summary n8n formats into a text
 * message: total appointments booked this week (MAKI + all clients), the
 * best-performing outreach script this week, any paused/alerted campaigns, and
 * the week-over-week CPA trend.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.N8N_WEBHOOK_SECRET;
  const provided = req.headers.get("x-webhook-secret");
  if (!expected || !provided || provided !== expected) {
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

  const { weekStart } = currentWeekRange();
  const lastWeekStart = new Date(new Date(weekStart).getTime() - 7 * 86400000)
    .toISOString()
    .slice(0, 10);

  const [{ data: spend }, { data: appts }, { data: campaigns }, { data: alerts }, { data: scripts }, { data: contacts }] =
    await Promise.all([
      supabase.from("spend_daily").select("date, spend").gte("date", lastWeekStart),
      supabase.from("appointments").select("booked_at").gte("booked_at", lastWeekStart),
      supabase.from("campaigns").select("id, name, status"),
      supabase.from("alerts").select("type, message, campaign_id").eq("acknowledged", false),
      supabase.from("outreach_scripts").select("id, name"),
      supabase.from("outreach_contacts").select("script_id, status, contacted_at").gte("contacted_at", weekStart),
    ]);

  // Spend & appts, this week vs last week.
  let spendThis = 0;
  let spendLast = 0;
  for (const s of spend ?? []) {
    if (s.date >= weekStart) spendThis += Number(s.spend ?? 0);
    else spendLast += Number(s.spend ?? 0);
  }
  let apptsThis = 0;
  let apptsLast = 0;
  for (const a of appts ?? []) {
    const d = a.booked_at.slice(0, 10);
    if (d >= weekStart) apptsThis += 1;
    else if (d >= lastWeekStart) apptsLast += 1;
  }
  const cpaThis = apptsThis > 0 ? spendThis / apptsThis : null;
  const cpaLast = apptsLast > 0 ? spendLast / apptsLast : null;
  const changePct =
    cpaThis != null && cpaLast != null && cpaLast > 0
      ? Math.round(((cpaThis - cpaLast) / cpaLast) * 100)
      : null;

  // Best outreach script this week (by call-booked rate among scripts contacted this week).
  const scriptName = new Map((scripts ?? []).map((s) => [s.id, s.name]));
  const byScript = new Map<string, { status: OutreachContactStatus }[]>();
  for (const c of contacts ?? []) {
    if (!c.script_id) continue;
    const arr = byScript.get(c.script_id) ?? [];
    arr.push({ status: c.status });
    byScript.set(c.script_id, arr);
  }
  let bestScript: {
    name: string;
    contacted_this_week: number;
    call_booked_rate: number;
  } | null = null;
  for (const [id, cs] of byScript) {
    const f = computeFunnel(cs);
    if (
      f.contacted > 0 &&
      (!bestScript || f.callBookedRate > bestScript.call_booked_rate / 100)
    ) {
      bestScript = {
        name: scriptName.get(id) ?? "Unknown",
        contacted_this_week: f.contacted,
        call_booked_rate: Math.round(f.callBookedRate * 100),
      };
    }
  }

  // Paused or alerted campaigns.
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const flagged = [
    ...(campaigns ?? [])
      .filter((c) => c.status === "paused")
      .map((c) => ({ name: c.name, reason: "paused" as const })),
    ...(alerts ?? []).map((a) => ({
      name: campaignName.get(a.campaign_id) ?? "Unknown",
      reason: a.type,
      message: a.message,
    })),
  ];

  return NextResponse.json({
    week_start: weekStart,
    appointments_booked_this_week: apptsThis,
    spend_this_week: round(spendThis),
    best_outreach_script: bestScript,
    cpa_trend: {
      this_week: cpaThis != null ? round(cpaThis) : null,
      last_week: cpaLast != null ? round(cpaLast) : null,
      change_pct: changePct,
      direction:
        changePct == null ? "n/a" : changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
    },
    paused_or_alerted_campaigns: flagged,
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
