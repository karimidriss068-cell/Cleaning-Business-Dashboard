import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fetchMetaCampaignInsights } from "@/lib/meta";

export type MetaSyncResult = {
  since: string;
  until: string;
  rowsWritten: number;
  matchedCampaigns: number;
  unmappedMetaCampaigns: { campaign_id: string; campaign_name: string }[];
};

/**
 * Pulls campaign-level insights from Meta for [since, until] and upserts them
 * into spend_daily (source: 'meta_api'), matched to local campaigns via
 * campaigns.meta_campaign_id. Meta campaigns with no local mapping are
 * reported back, not silently dropped.
 */
export async function syncMetaSpend(
  supabase: SupabaseClient<Database>,
  since: string,
  until: string,
): Promise<MetaSyncResult> {
  const insights = await fetchMetaCampaignInsights(since, until);

  const { data: mappedCampaigns, error } = await supabase
    .from("campaigns")
    .select("id, meta_campaign_id")
    .not("meta_campaign_id", "is", null);
  if (error) throw new Error(error.message);

  const idByMetaCampaignId = new Map(
    (mappedCampaigns ?? []).map((c) => [c.meta_campaign_id as string, c.id]),
  );

  const unmatched = new Map<string, { campaign_id: string; campaign_name: string }>();
  const rows: Database["public"]["Tables"]["spend_daily"]["Insert"][] = [];

  for (const insight of insights) {
    const campaignId = idByMetaCampaignId.get(insight.campaign_id);
    if (!campaignId) {
      unmatched.set(insight.campaign_id, {
        campaign_id: insight.campaign_id,
        campaign_name: insight.campaign_name,
      });
      continue;
    }
    rows.push({
      campaign_id: campaignId,
      date: insight.date_start,
      spend: Number(insight.spend ?? 0),
      impressions: insight.impressions ? Number(insight.impressions) : null,
      clicks: insight.clicks ? Number(insight.clicks) : null,
      source: "meta_api",
    });
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("spend_daily")
      .upsert(rows, { onConflict: "campaign_id,date" });
    if (upsertError) throw new Error(upsertError.message);
  }

  return {
    since,
    until,
    rowsWritten: rows.length,
    matchedCampaigns: idByMetaCampaignId.size,
    unmappedMetaCampaigns: Array.from(unmatched.values()),
  };
}
