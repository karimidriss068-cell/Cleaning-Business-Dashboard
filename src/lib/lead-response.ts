import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const WARNING_MINUTES = (() => {
  const raw = process.env.LEAD_RESPONSE_WARNING_MINUTES;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
})();

export const CRITICAL_HOURS = (() => {
  const raw = process.env.LEAD_RESPONSE_CRITICAL_HOURS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 24;
})();

export type UncontactedLead = {
  id: string;
  name: string | null;
  accountId: string | null;
  accountName: string | null;
  campaignName: string | null;
  createdAt: string;
  minutesUncontacted: number;
  severity: "warning" | "critical";
};

/**
 * Leads still sitting at status 'new' (i.e. nobody has touched them yet) —
 * `leads.status` already IS the "contacted or not" signal in this schema,
 * so this is a straight age check, not a join against a separate contact
 * log. Only returns leads that have crossed at least the warning threshold;
 * fresh leads inside the response window aren't a flag yet.
 */
export async function getUncontactedLeads(
  supabase: SupabaseClient<Database>,
): Promise<UncontactedLead[]> {
  const now = Date.now();
  const warningCutoffIso = new Date(now - WARNING_MINUTES * 60000).toISOString();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, name, campaign_id, created_at")
    .eq("status", "new")
    .lte("created_at", warningCutoffIso);
  if (!leads || leads.length === 0) return [];

  const campaignIds = [...new Set(leads.map((l) => l.campaign_id).filter((id): id is string => !!id))];
  const { data: campaigns } = campaignIds.length
    ? await supabase.from("campaigns").select("id, name, account_id").in("id", campaignIds)
    : { data: [] as { id: string; name: string; account_id: string }[] };
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

  const accountIds = [...new Set((campaigns ?? []).map((c) => c.account_id))];
  const { data: accounts } = accountIds.length
    ? await supabase.from("accounts").select("id, name").in("id", accountIds)
    : { data: [] as { id: string; name: string }[] };
  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));

  const criticalMinutes = CRITICAL_HOURS * 60;

  return leads.map((l) => {
    const campaign = l.campaign_id ? campaignById.get(l.campaign_id) : undefined;
    const account = campaign ? accountById.get(campaign.account_id) : undefined;
    const minutesUncontacted = Math.floor((now - new Date(l.created_at).getTime()) / 60000);
    return {
      id: l.id,
      name: l.name,
      accountId: account?.id ?? null,
      accountName: account?.name ?? null,
      campaignName: campaign?.name ?? null,
      createdAt: l.created_at,
      minutesUncontacted,
      severity: minutesUncontacted >= criticalMinutes ? "critical" : "warning",
    };
  });
}
