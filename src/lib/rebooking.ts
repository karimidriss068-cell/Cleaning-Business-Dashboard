import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const DAY = 86400000;

export type CadenceWindow = { minDays: number; maxDays: number };

/**
 * Reasonable industry-default rebooking windows per treatment family —
 * matched by case-insensitive substring against the free-text
 * treatments.treatment_type field, first match wins. Editable/tunable here
 * in one place; not stored in the DB since these are practice-agnostic
 * starting defaults, not per-account config (yet).
 */
export const TREATMENT_CADENCE: { match: string; label: string; window: CadenceWindow }[] = [
  { match: "botox", label: "Botox", window: { minDays: 90, maxDays: 120 } },
  { match: "filler", label: "Filler", window: { minDays: 180, maxDays: 365 } },
  { match: "laser", label: "Laser", window: { minDays: 21, maxDays: 42 } },
  { match: "facial", label: "Facial", window: { minDays: 21, maxDays: 35 } },
  { match: "peel", label: "Chemical peel", window: { minDays: 21, maxDays: 35 } },
  { match: "microneedl", label: "Microneedling", window: { minDays: 28, maxDays: 42 } },
];

function cadenceFor(treatmentType: string): { label: string; window: CadenceWindow } | null {
  const lower = treatmentType.toLowerCase();
  const hit = TREATMENT_CADENCE.find((c) => lower.includes(c.match));
  return hit ? { label: hit.label, window: hit.window } : null;
}

export type RebookingStatus = "approaching" | "due" | "overdue";

export type RebookingFlag = {
  patientId: string;
  patientName: string | null;
  accountId: string;
  accountName: string;
  treatmentLabel: string;
  lastTreatmentDate: string;
  daysSinceTreatment: number;
  cadenceWindow: CadenceWindow;
  status: RebookingStatus;
};

/**
 * For each patient's most recent treatment per cadence-matched type, flags
 * whether they're approaching (within 14 days of the window opening), due
 * (inside the expected rebooking window), or overdue (past the window's
 * far edge) for their next visit. Treatment types that don't match any
 * known cadence are skipped, not guessed at.
 */
export async function getRebookingFlags(
  supabase: SupabaseClient<Database>,
): Promise<RebookingFlag[]> {
  const now = Date.now();

  const { data } = await supabase
    .from("treatments")
    .select(
      "patient_id, account_id, treatment_type, treatment_date, patient:patients(name), account:accounts(name)",
    )
    .not("treatment_date", "is", null)
    .order("treatment_date", { ascending: false });

  // Most recent treatment per (patient, cadence label) — rows are already
  // ordered newest-first, so the first hit per key wins.
  type Latest = {
    patientId: string;
    patientName: string | null;
    accountId: string;
    accountName: string;
    treatmentDate: string;
    cadenceLabel: string;
    window: CadenceWindow;
  };
  const latest = new Map<string, Latest>();
  for (const t of data ?? []) {
    const cadence = cadenceFor(t.treatment_type);
    if (!cadence || !t.treatment_date) continue;
    const key = `${t.patient_id}::${cadence.label}`;
    if (latest.has(key)) continue;
    latest.set(key, {
      patientId: t.patient_id,
      patientName: t.patient?.name ?? null,
      accountId: t.account_id,
      accountName: t.account?.name ?? "That account",
      treatmentDate: t.treatment_date,
      cadenceLabel: cadence.label,
      window: cadence.window,
    });
  }

  const flags: RebookingFlag[] = [];
  for (const t of latest.values()) {
    const daysSinceTreatment = Math.floor(
      (now - new Date(t.treatmentDate).getTime()) / DAY,
    );
    let status: RebookingStatus | null = null;
    if (daysSinceTreatment > t.window.maxDays) status = "overdue";
    else if (daysSinceTreatment >= t.window.minDays) status = "due";
    else if (daysSinceTreatment >= t.window.minDays - 14) status = "approaching";
    if (!status) continue;
    flags.push({
      patientId: t.patientId,
      patientName: t.patientName,
      accountId: t.accountId,
      accountName: t.accountName,
      treatmentLabel: t.cadenceLabel,
      lastTreatmentDate: t.treatmentDate,
      daysSinceTreatment,
      cadenceWindow: t.window,
      status,
    });
  }

  // Overdue first, then due, then approaching; ties broken by longest-overdue.
  const statusRank: Record<RebookingStatus, number> = { overdue: 0, due: 1, approaching: 2 };
  return flags.sort(
    (a, b) => statusRank[a.status] - statusRank[b.status] || b.daysSinceTreatment - a.daysSinceTreatment,
  );
}
