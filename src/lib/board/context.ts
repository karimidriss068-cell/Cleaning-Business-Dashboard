import type { GrowthSnapshot } from "@/lib/growth-snapshot";

// The optional business snapshot the advisors see. Built from the growth status numbers only, and
// only from a fixed list of figures and labels we chose here: no customer names, phones, emails,
// addresses, lead or campaign names, free-text notes or decisions, and nothing that is a secret.
// Cash, profit and the scale light are null for staff, so they are simply left out for them.

export const MAX_CONTEXT_CHARS = 2500;

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const line = (label: string, value: string | null) => (value === null ? null : `- ${label}: ${value}`);

export function buildBoardContext(s: GrowthSnapshot): string {
  const tier = s.tiers.paces.find((p) => p.selected);
  const month = s.profit?.thisMonth ?? null;
  const rows = s.channelTest.rows.filter((r) => r.enabled || r.spendCents > 0);
  const lines = [
    `Snapshot as of ${s.today}${s.includesDemo ? " (includes demo data, so some numbers are not real)" : ""}:`,
    line("Monthly revenue goal", usd(s.goal.monthlyGoalCents)),
    line("This month's milestone", s.pace.phase === "active" ? usd(s.pace.milestoneCents) : null),
    line("Revenue so far this month", usd(s.pace.revenueCents)),
    line("Pace this month", s.pace.phase === "active" ? `${s.pace.status.replace("_", " ")} (${s.pace.daysAhead >= 0 ? "+" : ""}${s.pace.daysAhead} days vs a straight line)` : null),
    line("Tracked tier", tier ? `${tier.label}, this month at ${tier.percentOfFull === null ? "an unknown share" : `${tier.percentOfFull}%`} of the full target` : null),
    line("Recurring residential clients", `${s.clients.residential.have} of ${s.clients.residential.need} needed`),
    line("Commercial accounts", `${s.clients.commercial.have} of ${s.clients.commercial.need} needed`),
    line("Leads per week", `${s.leads.perWeekActual} actual, ${s.leads.perWeekNeeded} needed`),
    line("Net profit this month", month?.netProfitCents != null ? usd(month.netProfitCents) : null),
    line("Cash on hand", s.cash ? `${usd(s.cash.onHandCents)} (buffer ${usd(s.cash.bufferCents)}, ${s.cash.status})` : null),
    line("Cash runway", s.cash ? (s.cash.runwayMonths === null ? "cash is not shrinking" : `${s.cash.runwayMonths} months`) : null),
    line("Scale light", s.scaleLight ? `${s.scaleLight.status}${s.scaleLight.blocking.length ? ` (blocked by ${s.scaleLight.blocking.map((b) => b.label).join(", ")})` : ""}` : null),
    line("Gates", s.gates.length ? s.gates.map((g) => `${g.label}: ${g.status.replace("_", " ")}`).join("; ") : null),
    line("Channel test", rows.length ? rows.map((r) => `${r.label} ${usd(r.spendCents)} spent, ${r.leads} leads, ${r.booked} booked`).join("; ") : null),
    line("Channel test advice", s.channelTest.recommendation.headline),
  ].filter((l): l is string => l !== null);
  const text = lines.join("\n");
  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS - 1)}…` : text;
}
