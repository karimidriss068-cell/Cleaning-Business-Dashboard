import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { money } from "@/lib/format";
import type { Enums } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 1000 * 60 * 60 * 24;
const ALERT_COOLDOWN_MS = DAY; // only re-alert a campaign after 24h

type FiredAlert = {
  campaign_id: string;
  campaign_name: string;
  account_id: string;
  type: Enums<"alert_type">;
  message: string;
  cpa_3d: number | null;
  spend_3d: number;
  appts_3d: number;
};

/**
 * POST /api/webhooks/check-thresholds  (called by scheduled n8n workflow)
 *
 * For every ACTIVE campaign, computes rolling 3-day CPA and fires:
 *   - cpa_critical (+ pauses the campaign) if CPA >= account.auto_pause_threshold
 *   - cpa_warning                          if CPA >= account.cpa_alert_threshold
 *   - zero_leads                           if no leads in the last 48h
 * De-duped per campaign via campaigns.last_alert_sent_at (24h cooldown).
 * Returns the alerts fired so n8n can loop and send notifications.
 */
export async function POST(req: NextRequest) {
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

  const now = Date.now();
  const spendSince = new Date(now - 2 * DAY).toISOString().slice(0, 10); // 3 calendar days
  const apptSince = new Date(now - 3 * DAY).toISOString();
  const leadSince48 = new Date(now - 2 * DAY).toISOString();

  const [{ data: campaigns }, { data: spend }, { data: leads }, { data: appts }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, name, account_id, status, created_at, last_alert_sent_at, account:accounts(cpa_alert_threshold, auto_pause_threshold)",
        )
        .eq("status", "active"),
      supabase.from("spend_daily").select("campaign_id, spend").gte("date", spendSince),
      supabase.from("leads").select("id, campaign_id, created_at"),
      supabase.from("appointments").select("lead_id, booked_at").gte("booked_at", apptSince),
    ]);

  // spend (3d) by campaign
  const spend3 = new Map<string, number>();
  for (const s of spend ?? []) {
    spend3.set(s.campaign_id, (spend3.get(s.campaign_id) ?? 0) + Number(s.spend ?? 0));
  }

  // lead -> campaign, plus recent-lead flag by campaign
  const leadCampaign = new Map<string, string | null>();
  const recentLeadCampaigns = new Set<string>();
  for (const l of leads ?? []) {
    leadCampaign.set(l.id, l.campaign_id);
    if (l.campaign_id && l.created_at >= leadSince48) {
      recentLeadCampaigns.add(l.campaign_id);
    }
  }

  // appointments (3d) by campaign
  const appts3 = new Map<string, number>();
  for (const a of appts ?? []) {
    const cid = leadCampaign.get(a.lead_id);
    if (cid) appts3.set(cid, (appts3.get(cid) ?? 0) + 1);
  }

  const fired: FiredAlert[] = [];
  const nowIso = new Date(now).toISOString();

  for (const c of campaigns ?? []) {
    // Cooldown: skip if we alerted this campaign within the last 24h.
    if (
      c.last_alert_sent_at &&
      now - new Date(c.last_alert_sent_at).getTime() < ALERT_COOLDOWN_MS
    ) {
      continue;
    }

    const s3 = spend3.get(c.id) ?? 0;
    const a3 = appts3.get(c.id) ?? 0;
    const cpa = a3 > 0 ? s3 / a3 : null;
    const alertT = c.account?.cpa_alert_threshold ?? null;
    const pauseT = c.account?.auto_pause_threshold ?? null;

    // "breaches T" when we have a real CPA over T, or we've spent >= T with 0 appts.
    const breaches = (t: number | null) =>
      t != null && ((cpa != null && cpa >= t) || (cpa == null && s3 >= t));

    let type: Enums<"alert_type"> | null = null;
    let message = "";

    const cpaLabel = cpa != null ? money(cpa) : `${money(s3)} spend / 0 appts`;

    if (breaches(pauseT)) {
      type = "cpa_critical";
      message = `${c.name}: rolling 3-day CPA ${cpaLabel} ≥ auto-pause ${money(pauseT)} — campaign paused.`;
    } else if (breaches(alertT)) {
      type = "cpa_warning";
      message = `${c.name}: rolling 3-day CPA ${cpaLabel} ≥ alert threshold ${money(alertT)}.`;
    } else if (
      !recentLeadCampaigns.has(c.id) &&
      now - new Date(c.created_at).getTime() >= 2 * DAY
    ) {
      type = "zero_leads";
      message = `${c.name}: zero leads in the last 48 hours.`;
    }

    if (!type) continue;

    const { error: insErr } = await supabase
      .from("alerts")
      .insert({ campaign_id: c.id, type, message });
    if (insErr) continue;

    // Pause on critical; stamp cooldown on every fired alert.
    await supabase
      .from("campaigns")
      .update({
        last_alert_sent_at: nowIso,
        ...(type === "cpa_critical" ? { status: "paused" as const } : {}),
      })
      .eq("id", c.id);

    fired.push({
      campaign_id: c.id,
      campaign_name: c.name,
      account_id: c.account_id,
      type,
      message,
      cpa_3d: cpa,
      spend_3d: s3,
      appts_3d: a3,
    });
  }

  return NextResponse.json({ count: fired.length, alerts: fired });
}
