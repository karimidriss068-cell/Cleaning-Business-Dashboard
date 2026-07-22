import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const DAY = 86400000;

/** How urgently a package with unused sessions needs outreach before it lapses. */
export type PackageExpirationUrgency = "critical" | "warning" | "notice";

export type ExpiringPackage = {
  packageId: string;
  patientId: string;
  patientName: string | null;
  accountId: string;
  accountName: string;
  packageName: string;
  sessionsTotal: number;
  sessionsUsed: number;
  sessionsRemaining: number;
  expirationDate: string;
  daysUntilExpiration: number;
  urgency: PackageExpirationUrgency;
  /** Proportional value still unredeemed (price × remaining/total sessions) —
   * a direct read of existing data, never an invented conversion estimate. */
  unredeemedValue: number | null;
};

function urgencyFor(daysUntilExpiration: number): PackageExpirationUrgency {
  if (daysUntilExpiration <= 7) return "critical";
  if (daysUntilExpiration <= 14) return "warning";
  return "notice";
}

/**
 * Packages/memberships with sessions still unused that expire within 30
 * days — the core signal for the Phase 2 expiration tracker. Already-expired
 * or fully-used packages are excluded (nothing actionable left to flag).
 */
export async function getExpiringPackages(
  supabase: SupabaseClient<Database>,
): Promise<ExpiringPackage[]> {
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const in30Iso = new Date(now + 30 * DAY).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("packages")
    .select(
      "id, patient_id, account_id, package_name, sessions_total, sessions_used, expiration_date, price, patient:patients(name), account:accounts(name)",
    )
    .not("expiration_date", "is", null)
    .gte("expiration_date", todayIso)
    .lte("expiration_date", in30Iso);

  return (data ?? [])
    .filter((p) => p.sessions_used < p.sessions_total)
    .map((p) => {
      const daysUntilExpiration = Math.max(
        0,
        Math.round(
          (new Date(`${p.expiration_date}T00:00:00Z`).getTime() - now) / DAY,
        ),
      );
      const sessionsRemaining = p.sessions_total - p.sessions_used;
      return {
        packageId: p.id,
        patientId: p.patient_id,
        patientName: p.patient?.name ?? null,
        accountId: p.account_id,
        accountName: p.account?.name ?? "That account",
        packageName: p.package_name,
        sessionsTotal: p.sessions_total,
        sessionsUsed: p.sessions_used,
        sessionsRemaining,
        expirationDate: p.expiration_date as string,
        daysUntilExpiration,
        urgency: urgencyFor(daysUntilExpiration),
        unredeemedValue:
          p.price != null
            ? Math.round((Number(p.price) * (sessionsRemaining / p.sessions_total)) * 100) / 100
            : null,
      };
    })
    .sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
}
