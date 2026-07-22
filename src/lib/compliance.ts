import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ConsentMissingTreatment = {
  treatmentId: string;
  patientId: string;
  patientName: string | null;
  accountId: string;
  accountName: string;
  treatmentType: string;
  treatmentDate: string | null;
};

/**
 * Treatments that have already happened (a past treatment_date, or no date
 * at all — absence of a date is never treated as "not yet performed") with
 * no consent on file. A compliance/risk signal, distinct in kind from the
 * performance-oriented digest findings elsewhere in this app.
 */
export async function getMissingConsentTreatments(
  supabase: SupabaseClient<Database>,
): Promise<ConsentMissingTreatment[]> {
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("treatments")
    .select(
      "id, patient_id, account_id, treatment_type, treatment_date, patient:patients(name), account:accounts(name)",
    )
    .eq("consent_on_file", false);

  return (data ?? [])
    .filter((t) => t.treatment_date === null || t.treatment_date <= todayIso)
    .map((t) => ({
      treatmentId: t.id,
      patientId: t.patient_id,
      patientName: t.patient?.name ?? null,
      accountId: t.account_id,
      accountName: t.account?.name ?? "That account",
      treatmentType: t.treatment_type,
      treatmentDate: t.treatment_date,
    }));
}
