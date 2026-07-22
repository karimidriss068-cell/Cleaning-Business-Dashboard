import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { TREATMENT_CADENCE } from "@/lib/rebooking";

function normalizeTreatmentLabel(treatmentType: string): string {
  const lower = treatmentType.toLowerCase();
  const hit = TREATMENT_CADENCE.find((c) => lower.includes(c.match));
  return hit ? hit.label : treatmentType.trim();
}

type PackageInfo = { packageName: string; sessionsTotal: number; sessionsUsed: number; expirationDate: string | null };

type PatientUpsellContext = {
  treatmentCounts: Map<string, number>;
  packages: PackageInfo[];
  hasActiveMembership: boolean;
};

export type UpsellRule = {
  key: string;
  suggestion: string;
  /** Returns a human reason string when the rule fires for this patient, null otherwise. */
  reason: (ctx: PatientUpsellContext) => string | null;
};

/**
 * Simple, editable rule-based upsell mapping — no ML, just readable
 * if/then logic tuned by hand. Add/adjust rules here; each one only needs
 * to read a patient's treatment-type counts and package history.
 */
export const UPSELL_RULES: UpsellRule[] = [
  {
    key: "botox_no_filler",
    suggestion: "Suggest a filler consult",
    reason: (ctx) => {
      const botox = ctx.treatmentCounts.get("Botox") ?? 0;
      const filler = ctx.treatmentCounts.get("Filler") ?? 0;
      return botox >= 3 && filler === 0
        ? `${botox} Botox treatments on record, no filler yet`
        : null;
    },
  },
  {
    key: "completed_package_no_membership",
    suggestion: "Suggest a membership",
    reason: (ctx) => {
      if (ctx.hasActiveMembership) return null;
      const completed = ctx.packages.find(
        (p) => p.sessionsTotal > 0 && p.sessionsUsed >= p.sessionsTotal,
      );
      return completed
        ? `Completed the "${completed.packageName}" package, no active membership`
        : null;
    },
  },
  {
    key: "laser_no_facial",
    suggestion: "Suggest a facial add-on",
    reason: (ctx) => {
      const laser = ctx.treatmentCounts.get("Laser") ?? 0;
      const facial = ctx.treatmentCounts.get("Facial") ?? 0;
      return laser >= 2 && facial === 0
        ? `${laser} laser treatments on record, no facials yet`
        : null;
    },
  },
];

export type UpsellOpportunity = {
  patientId: string;
  patientName: string | null;
  accountId: string;
  accountName: string;
  ruleKey: string;
  suggestion: string;
  reason: string;
};

/**
 * Runs every UPSELL_RULES entry against every patient's treatment/package
 * history, returning one opportunity per (patient, matched rule). A
 * membership is "active" if it isn't expired yet — packages named for a
 * membership plan aren't expected to track sessions the same way treatment
 * packages do, so expiration (not session count) is the signal there.
 */
export async function getUpsellOpportunities(
  supabase: SupabaseClient<Database>,
): Promise<UpsellOpportunity[]> {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: patients }, { data: treatments }, { data: packages }] = await Promise.all([
    supabase.from("patients").select("id, name, account_id, account:accounts(name)"),
    supabase.from("treatments").select("patient_id, treatment_type"),
    supabase
      .from("packages")
      .select("patient_id, package_name, sessions_total, sessions_used, expiration_date"),
  ]);

  const treatmentCountsByPatient = new Map<string, Map<string, number>>();
  for (const t of treatments ?? []) {
    const label = normalizeTreatmentLabel(t.treatment_type);
    const m = treatmentCountsByPatient.get(t.patient_id) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    treatmentCountsByPatient.set(t.patient_id, m);
  }

  const packagesByPatient = new Map<string, PackageInfo[]>();
  for (const p of packages ?? []) {
    const arr = packagesByPatient.get(p.patient_id) ?? [];
    arr.push({
      packageName: p.package_name,
      sessionsTotal: p.sessions_total,
      sessionsUsed: p.sessions_used,
      expirationDate: p.expiration_date,
    });
    packagesByPatient.set(p.patient_id, arr);
  }

  const opportunities: UpsellOpportunity[] = [];
  for (const p of patients ?? []) {
    const pkgs = packagesByPatient.get(p.id) ?? [];
    const ctx: PatientUpsellContext = {
      treatmentCounts: treatmentCountsByPatient.get(p.id) ?? new Map(),
      packages: pkgs,
      hasActiveMembership: pkgs.some(
        (pkg) =>
          pkg.packageName.toLowerCase().includes("membership") &&
          (!pkg.expirationDate || pkg.expirationDate >= todayIso),
      ),
    };
    for (const rule of UPSELL_RULES) {
      const reason = rule.reason(ctx);
      if (!reason) continue;
      opportunities.push({
        patientId: p.id,
        patientName: p.name,
        accountId: p.account_id,
        accountName: p.account?.name ?? "That account",
        ruleKey: rule.key,
        suggestion: rule.suggestion,
        reason,
      });
    }
  }

  return opportunities;
}
