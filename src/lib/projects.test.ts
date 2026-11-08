import { describe, expect, it } from "vitest";
import { depositCents, finalCents, projectMoney } from "@/lib/projects";
import { createProjectSchema, projectCostSchema, projectInvoiceSchema, workDaySchema } from "@/lib/schemas/projects";

const base = { contractCents: 913847, bidCostCents: 594000, bidMarginBps: 3500, dayPayCents: [], costCents: [], invoicedCents: 0, collectedCents: 0 };

describe("projectMoney", () => {
  it("with no work yet, profit is the whole contract and variance is the bid's cost", () => {
    const m = projectMoney(base);
    expect(m.actualCostCents).toBe(0);
    expect(m.actualProfitCents).toBe(913847);
    expect(m.bidProfitCents).toBe(913847 - 594000);
    expect(m.toInvoiceCents).toBe(913847);
    expect(m.costVarianceCents).toBe(-594000);
  });
  it("adds cleaner pay and project costs, treating unset pay as zero", () => {
    const m = projectMoney({ ...base, dayPayCents: [22000, 22000, null, 25000], costCents: [12000, 3500], invoicedCents: 274154, collectedCents: 274154 });
    expect(m.laborCents).toBe(69000);
    expect(m.otherCostsCents).toBe(15500);
    expect(m.actualCostCents).toBe(84500);
    expect(m.actualProfitCents).toBe(913847 - 84500);
    expect(m.toInvoiceCents).toBe(913847 - 274154);
    expect(m.collectedCents).toBe(274154);
  });
  it("reports the margin actually earned and how far it is from the bid's", () => {
    const over = projectMoney({ ...base, dayPayCents: [700000], costCents: [100000] }); // cost 800,000 vs bid 594,000
    expect(over.actualMarginBps).toBe(Math.trunc(((913847 - 800000) * 10000) / 913847));
    expect(over.costVarianceCents).toBe(206000);
    expect(over.marginVarianceBps).toBe(over.actualMarginBps - 3500);
    expect(over.marginVarianceBps).toBeLessThan(0);
  });
  it("shows a loss as a negative profit and margin", () => {
    const loss = projectMoney({ ...base, dayPayCents: [1000000] });
    expect(loss.actualProfitCents).toBeLessThan(0);
    expect(loss.actualMarginBps).toBeLessThan(0);
  });
  it("stays in whole cents", () => {
    const m = projectMoney({ ...base, dayPayCents: [33333, 33333], costCents: [1] });
    for (const v of [m.laborCents, m.otherCostsCents, m.actualCostCents, m.actualProfitCents, m.toInvoiceCents, m.costVarianceCents]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe("milestone amounts", () => {
  it("the deposit is the contract times the share, rounded half up like the database", () => {
    expect(depositCents(100000, 3000)).toBe(30000);
    expect(depositCents(913847, 3000)).toBe(274154); // 274,154.1 rounds to .1 -> 274,154
    expect(depositCents(1, 5000)).toBe(1); // 0.5 rounds up
    expect(depositCents(100000, 0)).toBe(0);
  });
  it("the final is what is left, never negative", () => {
    expect(finalCents(100000, 30000)).toBe(70000);
    expect(finalCents(100000, 130000)).toBe(0);
  });
});

describe("project schemas", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("defaults the deposit to 30% and refuses an end before the start", () => {
    const ok = createProjectSchema.parse({ bidId: id, expectedUpdatedAt: "2026-11-10T12:00:00.000Z" });
    expect(ok.depositBps).toBe(3000);
    expect(createProjectSchema.safeParse({ bidId: id, expectedUpdatedAt: "2026-11-10T12:00:00.000Z", startsOn: "2026-12-05", endsOn: "2026-12-01" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ bidId: id, expectedUpdatedAt: "2026-11-10T12:00:00.000Z", depositBps: 12000 }).success).toBe(false);
  });
  it("a progress payment needs an amount, the others may leave it out", () => {
    expect(projectInvoiceSchema.safeParse({ projectId: id, milestone: "progress" }).success).toBe(false);
    expect(projectInvoiceSchema.safeParse({ projectId: id, milestone: "progress", amountCents: 50000 }).success).toBe(true);
    expect(projectInvoiceSchema.safeParse({ projectId: id, milestone: "deposit" }).success).toBe(true);
    expect(projectInvoiceSchema.safeParse({ projectId: id, milestone: "final", amountCents: 10.5 }).success).toBe(false);
  });
  it("a work day must end after it starts; a cost must be above zero", () => {
    expect(workDaySchema.safeParse({ projectId: id, start: "2026-12-01T13:00:00.000Z", end: "2026-12-01T12:00:00.000Z" }).success).toBe(false);
    expect(workDaySchema.safeParse({ projectId: id, start: "2026-12-01T13:00:00.000Z", end: "2026-12-01T21:00:00.000Z" }).success).toBe(true);
    expect(projectCostSchema.safeParse({ projectId: id, category: "supplies", amountCents: 0, date: "2026-11-10" }).success).toBe(false);
    expect(projectCostSchema.safeParse({ projectId: id, category: "supplies", amountCents: 1200, date: "2026-11-10" }).success).toBe(true);
  });
});
