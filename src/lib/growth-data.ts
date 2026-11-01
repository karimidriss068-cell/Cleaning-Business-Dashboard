import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildGrowthSnapshot, type GrowthSnapshot } from "@/lib/growth";
import { growthInputsSchema } from "@/lib/schemas/growth";

type Db = SupabaseClient<Database>;

/**
 * The growth numbers for the signed-in user (staff see everything but cash
 * and the scale light; owner/admin see it all). Read-only.
 */
export async function loadGrowthSnapshot(db: Db): Promise<GrowthSnapshot> {
  const { data, error } = await db.rpc("growth_inputs");
  if (error) throw new Error(`Loading growth numbers failed: ${error.message}`);
  const parsed = growthInputsSchema.safeParse(data);
  if (!parsed.success) throw new Error(`Growth numbers had an unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return buildGrowthSnapshot(parsed.data);
}

/** Same numbers for the read-only bot endpoint: service role, full access to the read model only. */
export async function loadGrowthSnapshotForBots(admin: Db): Promise<GrowthSnapshot> {
  const { data, error } = await admin.rpc("growth_inputs_for_bots");
  if (error) throw new Error(`Loading growth numbers failed: ${error.message}`);
  const parsed = growthInputsSchema.safeParse(data);
  if (!parsed.success) throw new Error(`Growth numbers had an unexpected shape: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return buildGrowthSnapshot(parsed.data);
}
