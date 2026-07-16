import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const DAY = 86400000;

export type HealthGrade = "A" | "B" | "C";

export type HealthScoreInput = {
  /** Last-30d spend ÷ all last-30d appointments for this account (same
   * definition as insights.ts's `last30d.cpa`), null if no appointments. */
  cpa: number | null;
  cpaAlertThreshold: number | null;
  apptsShowed: number;
  apptsTotal: number;
  jobsClosed: number;
  /** jobsClosed + jobsNotClosed (i.e. how many "did this become a job"
   * questions have actually been answered, whether yes or no). */
  jobsAnswered: number;
  /** True if insights.ts's deterministic risk_assessment already flagged
   * this account — caps the grade so an at-risk account can never read as
   * a clean "A" regardless of what the three component scores say. */
  atRisk?: boolean;
};

export type HealthScoreResult = {
  /** 0-100, or null if there's genuinely no data to score from at all
   * (e.g. a brand new account with no spend and no appointments yet). */
  score: number | null;
  grade: HealthGrade | null;
  components: {
    efficiency: number | null;
    show_rate: number | null;
    close_rate: number | null;
  };
};

// Close-rate carries less weight than spend efficiency or show-rate by
// design (Phase 3 requirement: don't let sparse revenue data tank an
// otherwise healthy score) — and even its base weight only applies at full
// confidence, scaled down below that by sample size.
const BASE_WEIGHTS = { efficiency: 0.4, show_rate: 0.35, close_rate: 0.25 };
const CLOSE_RATE_FULL_CONFIDENCE_SAMPLE = 5;
const AT_RISK_SCORE_CAP = 60; // caps the grade at "B" territory, never "A"

function bandEfficiency(cpa: number, threshold: number): number {
  if (cpa <= threshold * 0.7) return 100;
  if (cpa <= threshold) return 80;
  if (cpa <= threshold * 1.3) return 50;
  return 20;
}
function bandRate(rate: number): number {
  if (rate >= 0.8) return 100;
  if (rate >= 0.6) return 75;
  if (rate >= 0.4) return 50;
  return 25;
}
function gradeFor(score: number): HealthGrade {
  if (score >= 80) return "A";
  if (score >= 55) return "B";
  return "C";
}

/**
 * Pure composite score — spend efficiency (CPA vs the account's own alert
 * threshold), show-rate, and close-rate, each banded into a 0-100 sub-score
 * and weighted together. A component with no underlying data is simply
 * excluded and the remaining weights renormalize, rather than treating
 * "unknown" as "bad."
 */
export function computeClientHealthScore(input: HealthScoreInput): HealthScoreResult {
  const efficiency =
    input.cpa !== null && input.cpaAlertThreshold
      ? bandEfficiency(input.cpa, input.cpaAlertThreshold)
      : null;
  const showRate = input.apptsTotal > 0 ? bandRate(input.apptsShowed / input.apptsTotal) : null;
  const closeRateRaw = input.jobsAnswered > 0 ? input.jobsClosed / input.jobsAnswered : null;
  const closeRate = closeRateRaw !== null ? bandRate(closeRateRaw) : null;
  const closeConfidence = Math.min(1, input.jobsAnswered / CLOSE_RATE_FULL_CONFIDENCE_SAMPLE);

  const weighted: { score: number; weight: number }[] = [];
  if (efficiency !== null) weighted.push({ score: efficiency, weight: BASE_WEIGHTS.efficiency });
  if (showRate !== null) weighted.push({ score: showRate, weight: BASE_WEIGHTS.show_rate });
  if (closeRate !== null) {
    weighted.push({ score: closeRate, weight: BASE_WEIGHTS.close_rate * closeConfidence });
  }

  const components = { efficiency, show_rate: showRate, close_rate: closeRate };
  if (weighted.length === 0) {
    return { score: null, grade: null, components };
  }

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let score =
    totalWeight > 0
      ? Math.round(weighted.reduce((s, w) => s + w.score * w.weight, 0) / totalWeight)
      : Math.round(weighted.reduce((s, w) => s + w.score, 0) / weighted.length);

  if (input.atRisk) score = Math.min(score, AT_RISK_SCORE_CAP);

  return { score, grade: gradeFor(score), components };
}

/**
 * Fetches the raw signals fresh (its own lightweight queries, not the full
 * /insights business snapshot) and scores every account — for surfaces like
 * the Accounts page that just need the score, not the whole aggregation
 * insights.ts already builds for its own request.
 */
export async function getClientHealthScores(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, HealthScoreResult>> {
  const now = Date.now();
  const since30Date = new Date(now - 30 * DAY).toISOString().slice(0, 10);
  const since30Iso = new Date(now - 30 * DAY).toISOString();

  const [{ data: accounts }, { data: campaigns }, { data: spend }, { data: appts }] = await Promise.all([
    supabase.from("accounts").select("id, cpa_alert_threshold"),
    supabase.from("campaigns").select("id, account_id"),
    supabase.from("spend_daily").select("campaign_id, date, spend").gte("date", since30Date),
    supabase
      .from("appointments")
      .select("account_id, status, job_closed, booked_at")
      .gte("booked_at", since30Iso),
  ]);

  const campaignAccount = new Map((campaigns ?? []).map((c) => [c.id, c.account_id]));
  const spendByAccount = new Map<string, number>();
  for (const s of spend ?? []) {
    const accountId = campaignAccount.get(s.campaign_id);
    if (!accountId) continue;
    spendByAccount.set(accountId, (spendByAccount.get(accountId) ?? 0) + Number(s.spend ?? 0));
  }

  type Agg = { showed: number; total: number; jobsClosed: number; jobsAnswered: number };
  const apptAgg = new Map<string, Agg>();
  const ensure = (id: string): Agg => {
    if (!apptAgg.has(id)) apptAgg.set(id, { showed: 0, total: 0, jobsClosed: 0, jobsAnswered: 0 });
    return apptAgg.get(id)!;
  };
  for (const ap of appts ?? []) {
    const a = ensure(ap.account_id);
    a.total += 1;
    if (ap.status === "showed" || ap.status === "closed") {
      a.showed += 1;
      if (ap.job_closed === true) {
        a.jobsClosed += 1;
        a.jobsAnswered += 1;
      } else if (ap.job_closed === false) {
        a.jobsAnswered += 1;
      } else if (ap.status === "closed") {
        // Legacy status set before the follow-up loop existed — treated as
        // a closed signal (see resolvedJobStatus in insights.ts) but with
        // no revenue figure, so it only affects the closed/answered counts.
        a.jobsClosed += 1;
        a.jobsAnswered += 1;
      }
    }
  }

  const result = new Map<string, HealthScoreResult>();
  for (const acc of accounts ?? []) {
    const spendTotal = spendByAccount.get(acc.id) ?? 0;
    const a = apptAgg.get(acc.id) ?? { showed: 0, total: 0, jobsClosed: 0, jobsAnswered: 0 };
    const cpa = a.total > 0 ? spendTotal / a.total : null;
    result.set(
      acc.id,
      computeClientHealthScore({
        cpa,
        cpaAlertThreshold: acc.cpa_alert_threshold,
        apptsShowed: a.showed,
        apptsTotal: a.total,
        jobsClosed: a.jobsClosed,
        jobsAnswered: a.jobsAnswered,
      }),
    );
  }
  return result;
}
