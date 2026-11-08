import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { pricingSnapshotSchema, type PricingSnapshot } from "@/lib/schemas/pricing";

/** The owner's pricing rules, or null when the caller can't read them (staff and cleaners get nothing). */
export async function loadPricingRules(supabase: SupabaseClient<Database>): Promise<PricingSnapshot | null> {
  const { data, error } = await supabase.rpc("pricing_rules_snapshot");
  if (error || data === null) return null;
  const parsed = pricingSnapshotSchema.safeParse(data);
  if (!parsed.success) throw new Error("Pricing rules didn't have the expected shape");
  return parsed.data;
}
