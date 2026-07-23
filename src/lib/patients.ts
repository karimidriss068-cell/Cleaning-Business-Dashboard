import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type FindOrCreatePatientInput = {
  accountId: string;
  ghlContactId: string;
  name?: string | null;
  phone?: string | null;
};

/**
 * Looks up a patient by (account_id, ghl_contact_id) — the unique index
 * added in the Phase 1 patients migration — creating one if none exists.
 * Not a blind upsert: an existing row's name/phone is left alone so a
 * later webhook with sparser data (e.g. no phone on file) can't clobber
 * fields already populated by an earlier one.
 */
export async function findOrCreatePatient(
  supabase: SupabaseClient<Database>,
  { accountId, ghlContactId, name, phone }: FindOrCreatePatientInput,
): Promise<string> {
  const { data: existing } = await supabase
    .from("patients")
    .select("id")
    .eq("account_id", accountId)
    .eq("ghl_contact_id", ghlContactId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("patients")
    .insert({
      account_id: accountId,
      ghl_contact_id: ghlContactId,
      name: name ?? null,
      phone: phone ?? null,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? "Could not create patient");
  }
  return created.id;
}
