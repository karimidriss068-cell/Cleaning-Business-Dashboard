// Invoice money math in integer cents. Mirrors the database exactly
// (private.calc_tax_cents and the generated total), so the editor can show a
// live preview that the server will confirm to the cent. Pure and tested.

export type LineInput = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

export type Totals = {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
};

function assertCents(n: number, what: string) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer number of cents, got ${n}`);
}

export function lineTotalCents(line: Pick<LineInput, "quantity" | "unitPriceCents">): number {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new RangeError(`quantity must be a positive integer, got ${line.quantity}`);
  assertCents(line.unitPriceCents, "unit price");
  return line.quantity * line.unitPriceCents;
}

export const subtotalCents = (lines: LineInput[]): number => lines.reduce((s, l) => s + lineTotalCents(l), 0);
export const taxableSubtotalCents = (lines: LineInput[]): number => lines.reduce((s, l) => s + (l.taxable ? lineTotalCents(l) : 0), 0);

/**
 * Sales tax in cents. The rate is in parts per million (8.875% = 88750).
 * Tax applies to the taxable lines after their proportional share of any
 * discount, rounded half up.
 */
export function calcTaxCents(input: { subtotalCents: number; taxableCents: number; discountCents: number; ratePpm: number }): number {
  const { subtotalCents: sub, taxableCents: taxable, discountCents: discount, ratePpm } = input;
  assertCents(sub, "subtotal");
  assertCents(taxable, "taxable amount");
  assertCents(discount, "discount");
  assertCents(ratePpm, "rate");
  if (sub <= 0) return 0;
  const share = Math.floor((discount * taxable + Math.floor(sub / 2)) / sub);
  const base = Math.max(taxable - share, 0);
  return Math.floor((base * ratePpm + 500000) / 1000000);
}

/** Subtotal, tax and total for a set of lines, with problems the editor should flag. */
export function invoiceTotals(lines: LineInput[], discountCents: number, depositCents: number, ratePpm: number): Totals & { problems: string[] } {
  const sub = subtotalCents(lines);
  const problems: string[] = [];
  if (discountCents > sub) problems.push("The discount can't be more than the subtotal.");
  const discount = Math.min(discountCents, sub);
  const tax = calcTaxCents({ subtotalCents: sub, taxableCents: taxableSubtotalCents(lines), discountCents: discount, ratePpm });
  const total = sub - discount + tax;
  if (depositCents > total) problems.push("The deposit can't be more than the total.");
  return { subtotalCents: sub, discountCents: discount, taxCents: tax, totalCents: total, depositCents: Math.min(depositCents, total), problems };
}

export const balanceCents = (totalCents: number, paidCents: number): number => Math.max(totalCents - paidCents, 0);

/** What is still owed toward the deposit (0 once it has been covered). */
export const depositDueCents = (depositCents: number, paidCents: number, totalCents: number): number =>
  Math.min(Math.max(depositCents - paidCents, 0), balanceCents(totalCents, paidCents));

/** The two amounts a customer can choose on the pay page. */
export function payChoices(input: { totalCents: number; depositCents: number; paidCents: number }): { depositDueCents: number; balanceCents: number } {
  return {
    depositDueCents: depositDueCents(input.depositCents, input.paidCents, input.totalCents),
    balanceCents: balanceCents(input.totalCents, input.paidCents),
  };
}

/** "8.875" <-> 88750 (parts per million). Up to four decimals; null if it isn't a rate. */
export function percentToPpm(input: string): number | null {
  const m = /^\s*(\d{1,2})(?:\.(\d{1,4}))?\s*%?\s*$/.exec(input);
  if (!m) return null;
  const ppm = Number(m[1]) * 10000 + Number((m[2] ?? "").padEnd(4, "0"));
  return ppm <= 300000 ? ppm : null;
}
export function ppmToPercent(ppm: number): string {
  assertCents(ppm, "rate");
  const whole = Math.floor(ppm / 10000);
  const frac = String(ppm % 10000).padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

export const invoiceNumberLabel = (n: number): string => `INV-${String(n).padStart(4, "0")}`;

/** Where a customer pays: the public, unguessable token page. */
export const payLinkPath = (token: string): string => `/pay/${token}`;
