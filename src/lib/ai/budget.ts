import { z } from "zod";
import { microsToCents } from "@/lib/ai/pricing";

// What ai_usage_summary() returns, and the alert rules the page and the Command Center banner share.

const cap = z.number().int().nullable();
const spend = z.object({ day_micros: z.number(), month_micros: z.number() });
const capped = z.object({ daily_cap_cents: cap, monthly_cap_cents: cap, hard_stop: z.boolean() });

export const aiSummarySchema = z.object({
  kill_switch: z.boolean(),
  day_start: z.string(),
  month_start: z.string(),
  budgets: z.array(
    z.object({
      scope: z.enum(["global", "feature", "bot", "user"]),
      key: z.string(),
      daily_cap_cents: cap,
      monthly_cap_cents: cap,
      hard_stop: z.boolean(),
      day_micros: z.number().nullable(),
      month_micros: z.number().nullable(),
    }),
  ),
  by_feature: z.array(spend.extend({ feature: z.string(), calls: z.number().int() }).extend(capped.shape)),
  by_actor: z.array(spend.extend({ actor_type: z.enum(["bot", "user"]), actor_id: z.string(), calls: z.number().int() }).extend(capped.shape)),
  refused_24h: z.number().int(),
  recent: z.array(
    z.object({
      at: z.string(),
      feature: z.string(),
      actor_type: z.string(),
      actor_id: z.string(),
      model: z.string(),
      status: z.enum(["reserved", "settled", "failed", "refused"]),
      cost_micros: z.number(),
      detail: z.string().nullable(),
    }),
  ),
});
export type AiSummary = z.infer<typeof aiSummarySchema>;

export const ALERT_AT_PERCENT = 80;

export type AiAlert = {
  scope: "global" | "feature" | "bot" | "user";
  key: string;
  window: "daily" | "monthly";
  spentCents: number;
  capCents: number;
  percent: number;
  /** At or over the cap: with hard stop on, calls are being refused. */
  over: boolean;
  hardStop: boolean;
};

/** Every cap that is at 80% or more, fullest first. A cap of zero counts as full. */
export function budgetAlerts(s: AiSummary): AiAlert[] {
  const found = new Map<string, AiAlert>();
  const add = (scope: AiAlert["scope"], key: string, window: AiAlert["window"], micros: number | null, capCents: number | null, hardStop: boolean) => {
    if (micros === null || capCents === null) return;
    const percent = capCents === 0 ? 100 : (micros / (capCents * 10_000)) * 100;
    if (percent < ALERT_AT_PERCENT) return;
    found.set(`${scope}:${key}:${window}`, { scope, key, window, spentCents: microsToCents(micros), capCents, percent, over: percent >= 100, hardStop });
  };
  for (const b of s.budgets) {
    add(b.scope, b.key, "daily", b.day_micros, b.daily_cap_cents, b.hard_stop);
    add(b.scope, b.key, "monthly", b.month_micros, b.monthly_cap_cents, b.hard_stop);
  }
  for (const f of s.by_feature) {
    add("feature", f.feature, "daily", f.day_micros, f.daily_cap_cents, f.hard_stop);
    add("feature", f.feature, "monthly", f.month_micros, f.monthly_cap_cents, f.hard_stop);
  }
  for (const a of s.by_actor) {
    add(a.actor_type, a.actor_id, "daily", a.day_micros, a.daily_cap_cents, a.hard_stop);
    add(a.actor_type, a.actor_id, "monthly", a.month_micros, a.monthly_cap_cents, a.hard_stop);
  }
  return [...found.values()].sort((x, y) => y.percent - x.percent);
}

export const scopeLabel: Record<AiAlert["scope"], string> = { global: "All AI", feature: "Feature", bot: "Bot", user: "Person" };
