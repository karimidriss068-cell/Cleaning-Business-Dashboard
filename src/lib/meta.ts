const META_API_VERSION = "v25.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export type MetaInsightRow = {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  impressions?: string;
  clicks?: string;
  date_start: string;
};

/**
 * Pulls campaign-level insights (spend/impressions/clicks) for a date range
 * from Meta's Marketing API, one row per campaign per day (time_increment=1).
 *
 * Endpoint contract verified against developers.facebook.com/docs/marketing-api/insights
 * (Graph API v25.0, current as of Feb 2026): GET /act_{account_id}/insights,
 * level=campaign, System User access token with the ads_read scope.
 */
export async function fetchMetaCampaignInsights(
  since: string,
  until: string,
): Promise<MetaInsightRow[]> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error("META_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not configured");
  }

  const rows: MetaInsightRow[] = [];
  let url: string | null =
    `${META_BASE_URL}/act_${adAccountId}/insights?` +
    new URLSearchParams({
      level: "campaign",
      time_increment: "1",
      fields: "campaign_id,campaign_name,spend,impressions,clicks",
      time_range: JSON.stringify({ since, until }),
      access_token: accessToken,
    }).toString();

  while (url) {
    const res: Response = await fetch(url);
    const data: {
      data?: MetaInsightRow[];
      paging?: { next?: string };
      error?: { message?: string };
    } | null = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = data?.error?.message || `Meta API error (${res.status})`;
      throw new Error(detail);
    }
    rows.push(...(data?.data ?? []));
    url = data?.paging?.next ?? null;
  }

  return rows;
}
