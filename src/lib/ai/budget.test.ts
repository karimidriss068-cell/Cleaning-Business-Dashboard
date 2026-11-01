import { describe, expect, it } from "vitest";
import { aiSummarySchema, budgetAlerts, type AiSummary } from "@/lib/ai/budget";

const base: AiSummary = { kill_switch: false, day_start: "2026-11-01T04:00:00Z", month_start: "2026-11-01T04:00:00Z", budgets: [], by_feature: [], by_actor: [], refused_24h: 0, recent: [] };
const cents = (c: number) => c * 10_000;

describe("budgetAlerts", () => {
  it("is quiet below 80%", () => {
    const s: AiSummary = { ...base, budgets: [{ scope: "global", key: "*", daily_cap_cents: 200, monthly_cap_cents: 2000, hard_stop: true, day_micros: cents(159), month_micros: cents(100) }] };
    expect(budgetAlerts(s)).toEqual([]);
  });
  it("alerts at 80% and says over at 100%", () => {
    const s: AiSummary = { ...base, budgets: [{ scope: "global", key: "*", daily_cap_cents: 200, monthly_cap_cents: 2000, hard_stop: true, day_micros: cents(160), month_micros: cents(2000) }] };
    const a = budgetAlerts(s);
    expect(a.map((x) => [x.window, x.over, Math.round(x.percent)])).toEqual([["monthly", true, 100], ["daily", false, 80]]);
  });
  it("checks each bot against its own default cap", () => {
    const s: AiSummary = {
      ...base,
      budgets: [{ scope: "bot", key: "*", daily_cap_cents: 50, monthly_cap_cents: 500, hard_stop: true, day_micros: null, month_micros: null }],
      by_actor: [
        { actor_type: "bot", actor_id: "roast", day_micros: cents(45), month_micros: cents(10), calls: 3, daily_cap_cents: 50, monthly_cap_cents: 500, hard_stop: true },
        { actor_type: "bot", actor_id: "agents", day_micros: cents(5), month_micros: cents(10), calls: 1, daily_cap_cents: 50, monthly_cap_cents: 500, hard_stop: true },
      ],
    };
    expect(budgetAlerts(s).map((a) => a.key)).toEqual(["roast"]);
  });
  it("doesn't list a named cap twice when it shows in both places", () => {
    const row = { daily_cap_cents: 100, monthly_cap_cents: 1000, hard_stop: true };
    const s: AiSummary = {
      ...base,
      budgets: [{ scope: "feature", key: "board", ...row, day_micros: cents(90), month_micros: cents(10) }],
      by_feature: [{ feature: "board", day_micros: cents(90), month_micros: cents(10), calls: 4, ...row }],
    };
    expect(budgetAlerts(s)).toHaveLength(1);
  });
  it("treats a cap of zero as full, and no cap as never", () => {
    const s: AiSummary = { ...base, budgets: [
      { scope: "feature", key: "off", daily_cap_cents: 0, monthly_cap_cents: null, hard_stop: true, day_micros: 0, month_micros: 0 },
      { scope: "feature", key: "free", daily_cap_cents: null, monthly_cap_cents: null, hard_stop: true, day_micros: cents(9999), month_micros: cents(9999) },
    ] };
    expect(budgetAlerts(s).map((a) => a.key)).toEqual(["off"]);
  });
  it("reports a soft cap too, flagged as not stopping calls", () => {
    const s: AiSummary = { ...base, budgets: [{ scope: "feature", key: "x", daily_cap_cents: 10, monthly_cap_cents: null, hard_stop: false, day_micros: cents(12), month_micros: cents(12) }] };
    expect(budgetAlerts(s)[0]).toMatchObject({ over: true, hardStop: false });
  });
});

describe("aiSummarySchema", () => {
  it("accepts the shape the database returns and rejects junk", () => {
    expect(aiSummarySchema.safeParse(base).success).toBe(true);
    expect(aiSummarySchema.safeParse({ ...base, budgets: [{ scope: "everything" }] }).success).toBe(false);
  });
});
