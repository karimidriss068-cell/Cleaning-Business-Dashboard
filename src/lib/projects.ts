// Project money in integer cents, in one place: what a project was bid at against what it actually cost.
// Revenue is the contract (what was won); invoiced and collected are shown beside it. Cost is what the cleaners
// are paid for the project's work days plus the costs tagged on the project; overhead and the owner's own
// selling time are not allocated, so this is direct profit.

import { percentOfCents } from "@/lib/format";
import { marginBps } from "@/lib/bids";

export type ProjectMoneyInput = {
  contractCents: number;
  bidCostCents: number;
  bidMarginBps: number;
  /** Pay for each cleaner on each work day, in cents (null counts as 0 until it is set). */
  dayPayCents: (number | null)[];
  /** Costs tagged on the project (supplies, equipment, travel...). */
  costCents: number[];
  /** Invoice subtotals after discount, before tax, for invoices that aren't void. */
  invoicedCents: number;
  /** What has been paid on them, less refunds. */
  collectedCents: number;
};

export type ProjectMoney = {
  contractCents: number;
  invoicedCents: number;
  collectedCents: number;
  /** Still to invoice against the contract; negative if invoices exceed it. */
  toInvoiceCents: number;
  laborCents: number;
  otherCostsCents: number;
  actualCostCents: number;
  actualProfitCents: number;
  actualMarginBps: number;
  bidCostCents: number;
  bidProfitCents: number;
  bidMarginBps: number;
  /** Actual cost minus the bid's cost: positive means over. */
  costVarianceCents: number;
  /** Actual margin minus the bid's margin, in basis points. */
  marginVarianceBps: number;
};

const sum = (xs: (number | null)[]) => xs.reduce<number>((t, x) => t + (x ?? 0), 0);

export function projectMoney(i: ProjectMoneyInput): ProjectMoney {
  const laborCents = sum(i.dayPayCents);
  const otherCostsCents = sum(i.costCents);
  const actualCostCents = laborCents + otherCostsCents;
  const actualProfitCents = i.contractCents - actualCostCents;
  const actualMarginBps = marginBps(i.contractCents, actualCostCents);
  return {
    contractCents: i.contractCents,
    invoicedCents: i.invoicedCents,
    collectedCents: i.collectedCents,
    toInvoiceCents: i.contractCents - i.invoicedCents,
    laborCents,
    otherCostsCents,
    actualCostCents,
    actualProfitCents,
    actualMarginBps,
    bidCostCents: i.bidCostCents,
    bidProfitCents: i.contractCents - i.bidCostCents,
    bidMarginBps: i.bidMarginBps,
    costVarianceCents: actualCostCents - i.bidCostCents,
    marginVarianceBps: actualMarginBps - i.bidMarginBps,
  };
}

/** The deposit invoice amount: the contract times the deposit share, rounded half up (same as the database). */
export const depositCents = (contractCents: number, depositBps: number): number => percentOfCents(contractCents, depositBps);

/** What the final invoice would be: whatever the contract has not yet been invoiced for. */
export const finalCents = (contractCents: number, invoicedCents: number): number => Math.max(contractCents - invoicedCents, 0);
