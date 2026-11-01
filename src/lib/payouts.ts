import { addDays, formatCalendarDate, formatCents, nyWeekStart } from "@/lib/format";

// Payout, 1099 and CSV helpers. Pure and tested; the database decides what is
// eligible (private.payout_core) and this turns its answers into words.

export type ReasonCode =
  | "pay_pending"
  | "already_paid"
  | "in_other_draft"
  | "no_invoice"
  | "invoice_draft"
  | "invoice_partial"
  | "invoice_unpaid";

export type ReasonContext = { invoiceNumber?: number | null; balanceCents?: number | null };

/** Why a completed visit is not on this week's payout, in plain words. */
export function reasonLabel(code: ReasonCode | string, ctx: ReasonContext = {}): string {
  const inv = ctx.invoiceNumber ? `Invoice #${ctx.invoiceNumber}` : "Invoice";
  const due = ctx.balanceCents ? ` (${formatCents(ctx.balanceCents)} due)` : "";
  switch (code) {
    case "pay_pending":
      return "Pay not set yet (hours not entered)";
    case "already_paid":
      return "Already on an approved or paid payout";
    case "in_other_draft":
      return "Waiting in another week's draft";
    case "no_invoice":
      return "No invoice yet. Invoice it first";
    case "invoice_draft":
      return `${inv} hasn't been sent`;
    case "invoice_partial":
      return `${inv} is only partly paid${due}`;
    case "invoice_unpaid":
      return `${inv} is unpaid${due}`;
    default:
      return "Not eligible";
  }
}

/** Monday of the New York week containing a calendar date. */
export const payoutWeekStart = (date: string): string => nyWeekStart(date);

/** The most recent `count` week starts (Mondays), newest first, ending with the week of `today`. */
export function recentWeekStarts(today: string, count: number): string[] {
  const first = nyWeekStart(today);
  return Array.from({ length: count }, (_, i) => addDays(first, -7 * i));
}

export const weekLabel = (weekStart: string): string => `${formatCalendarDate(weekStart).replace(/, \d{4}$/, "")} – ${formatCalendarDate(addDays(weekStart, 6))}`;

// ---------------------------------------------------------------------------
// 1099 tracking
// ---------------------------------------------------------------------------

export type Threshold1099 = "ok" | "approaching" | "over";

/**
 * Where a subcontractor stands against the 1099 reporting threshold (a
 * setting: confirm the current IRS figure with your accountant). Over means
 * paid at or above the threshold; approaching starts at warnBps of it.
 * A threshold of 0 turns the flag off.
 */
export function classify1099(paidCents: number, thresholdCents: number, warnBps: number): Threshold1099 {
  if (![paidCents, thresholdCents, warnBps].every(Number.isSafeInteger) || paidCents < 0 || thresholdCents < 0 || warnBps < 0) {
    throw new RangeError("classify1099 expects non-negative integers");
  }
  if (thresholdCents === 0) return "ok";
  if (paidCents >= thresholdCents) return "over";
  if (paidCents * 10000 >= thresholdCents * warnBps) return "approaching";
  return "ok";
}

export const remainingToThresholdCents = (paidCents: number, thresholdCents: number): number => Math.max(thresholdCents - paidCents, 0);

export type Row1099 = {
  displayName: string;
  legalName: string | null;
  businessEntity: string;
  w9OnFile: boolean;
  paidCents: number;
  approvedCents: number;
};

export type Totals1099 = { paidCents: number; over: number; approaching: number; missingW9: number };

/** Year totals for the summary strip. A missing W-9 only matters once there is something to report. */
export function totals1099(rows: Row1099[], thresholdCents: number, warnBps: number): Totals1099 {
  let paid = 0;
  let over = 0;
  let approaching = 0;
  let missingW9 = 0;
  for (const r of rows) {
    paid += r.paidCents;
    const c = classify1099(r.paidCents, thresholdCents, warnBps);
    if (c === "over") over += 1;
    if (c === "approaching") approaching += 1;
    if (!r.w9OnFile && (r.paidCents > 0 || r.approvedCents > 0)) missingW9 += 1;
  }
  return { paidCents: paid, over, approaching, missingW9 };
}

// ---------------------------------------------------------------------------
// CSV for the accountant
// ---------------------------------------------------------------------------

/** 123456 -> "1234.56" (a plain number, so spreadsheets treat it as one). */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`expected integer cents, got ${cents}`);
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * One CSV field. Quotes when needed, and defuses spreadsheet formulas: a text
 * cell starting with = + - @ (or a tab/CR) gets a leading apostrophe, so a
 * hostile name can't run as a formula when the file is opened in Excel.
 */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  let text = typeof value === "number" ? String(value) : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function build1099Csv(input: { year: number; rows: Row1099[]; thresholdCents: number; warnBps: number }): string {
  const header = ["Tax year", "Subcontractor", "Legal name", "Entity type", "W-9 on file", "Paid in year (USD)", "Approved, not yet paid (USD)", "Threshold (USD)", "Status"];
  const status: Record<Threshold1099, string> = { ok: "Under threshold", approaching: "Approaching threshold", over: "Over threshold: report" };
  const lines = [header.map(csvCell).join(",")];
  for (const r of input.rows) {
    lines.push(
      [
        input.year,
        r.displayName,
        r.legalName,
        r.businessEntity,
        r.w9OnFile ? "Yes" : "No",
        centsToDecimal(r.paidCents),
        centsToDecimal(r.approvedCents),
        centsToDecimal(input.thresholdCents),
        status[classify1099(r.paidCents, input.thresholdCents, input.warnBps)],
      ]
        .map((v) => csvCell(v))
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Finance months
// ---------------------------------------------------------------------------

/** Gross margin as a share of what was collected, in basis points (null when nothing was collected). */
export function marginBps(marginCents: number, collectedCents: number): number | null {
  if (collectedCents <= 0) return null;
  return Math.round((marginCents * 10000) / collectedCents);
}

/** "2026-11-01" -> "Nov" (a calendar month label; no time zone involved). */
export function monthShort(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
