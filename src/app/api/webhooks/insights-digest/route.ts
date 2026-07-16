import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { computeDailyDigest } from "@/lib/insights-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/insights-digest (called once a day by a scheduled n8n
 * workflow — same pattern as check-thresholds/weekly-digest: shared secret
 * header, no user session, admin client).
 *
 * Computes zero-lead accounts, over-threshold campaign CPA, and creative CPA
 * spikes, then replaces today's insights_digest rows with the fresh set —
 * so a retried/duplicate cron tick the same day doesn't double up findings.
 * /insights reads today's undismissed rows on page load as "Today's flags".
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

  const findings = await computeDailyDigest(supabase);
  const today = new Date().toISOString().slice(0, 10);

  await supabase.from("insights_digest").delete().eq("digest_date", today);

  if (findings.length > 0) {
    await supabase.from("insights_digest").insert(
      findings.map((f) => ({
        account_id: f.accountId,
        campaign_id: f.campaignId,
        creative_id: f.creativeId,
        finding_type: f.findingType,
        message: f.message,
        digest_date: today,
      })),
    );
  }

  return NextResponse.json({ count: findings.length, findings });
}
