import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { growthSettingsSchema } from "@/lib/schemas/growth";

/** The saved growth_settings row, parsed. Shared by /growth and /growth/settings. */
export async function loadGrowthSettings(supabase: SupabaseClient<Database>) {
  const { data: settingsRow, error } = await supabase.from("growth_settings").select("*").single();
  if (error) throw new Error(`Loading growth settings failed: ${error.message}`);
  return growthSettingsSchema.parse({
    startDate: settingsRow.start_date,
    residentialTargetCents: settingsRow.residential_target_cents,
    commercialTargetCents: settingsRow.commercial_target_cents,
    resVisitPriceCents: settingsRow.res_visit_price_cents,
    resVisitsPerMonth: settingsRow.res_visits_per_month,
    commAccountValueCents: settingsRow.comm_account_value_cents,
    closeRateBps: settingsRow.close_rate_bps,
    cacCents: settingsRow.cac_cents,
    marginBps: settingsRow.margin_bps,
    monthlyAdBudgetCents: settingsRow.monthly_ad_budget_cents,
    replyTargetMinutes: settingsRow.reply_target_minutes,
    cleansPerCleanerPerWeek: settingsRow.cleans_per_cleaner_per_week,
    startingCapitalCents: settingsRow.starting_capital_cents,
    cashStartDate: settingsRow.cash_start_date,
    monthlyFixedCostsCents: settingsRow.monthly_fixed_costs_cents,
    minBufferCents: settingsRow.min_buffer_cents,
  });
}
