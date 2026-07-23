import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Case-insensitive lookup only — never creates a provider. Unlike patients
 * (identified by a stable ghl_contact_id), a provider here is identified
 * only by a free-text name typed into a GHL "assigned user"/custom field,
 * too unreliable to auto-create from: a typo would silently mint a
 * duplicate provider row. Callers should insert with provider_id null and
 * log a warning when this returns null, rather than fail the request.
 *
 * Uses ilike rather than a case-insensitive eq (Postgres has no built-in
 * citext-free equivalent) — a name containing a literal `%`/`_` would be
 * treated as a wildcard, an accepted tradeoff given provider names are
 * short human names, not user-controlled search strings.
 */
export async function findProviderByName(
  supabase: SupabaseClient<Database>,
  accountId: string,
  name: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("providers")
    .select("id")
    .eq("account_id", accountId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
