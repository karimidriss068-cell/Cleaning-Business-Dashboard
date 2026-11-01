import { describe, expect, it } from "vitest";
import {
  balanceCents,
  calcTaxCents,
  depositDueCents,
  invoiceNumberLabel,
  invoiceTotals,
  lineTotalCents,
  payChoices,
  percentToPpm,
  ppmToPercent,
  subtotalCents,
  taxableSubtotalCents,
  type LineInput,
} from "./invoices";

const clean: LineInput = { description: "Standard clean", quantity: 1, unitPriceCents: 20000, taxable: true };
const oven: LineInput = { description: "Inside oven", quantity: 1, unitPriceCents: 4000, taxable: false };

describe("line and subtotal math", () => {
  it("multiplies in cents and sums", () => {
    expect(lineTotalCents({ quantity: 3, unitPriceCents: 1999 })).toBe(5997);
    expect(subtotalCents([clean, oven])).toBe(24000);
    expect(taxableSubtotalCents([clean, oven])).toBe(20000);
  });
  it("refuses non-integers and bad quantities instead of rounding silently", () => {
    expect(() => lineTotalCents({ quantity: 1, unitPriceCents: 19.99 })).toThrow(RangeError);
    expect(() => lineTotalCents({ quantity: 0, unitPriceCents: 100 })).toThrow(RangeError);
    expect(() => lineTotalCents({ quantity: 1, unitPriceCents: -1 })).toThrow(RangeError);
  });
});

describe("sales tax (off by default, per line, rate in parts per million)", () => {
  it("is zero at a 0% rate or with no taxable lines", () => {
    expect(invoiceTotals([clean, oven], 0, 0, 0).taxCents).toBe(0);
    expect(invoiceTotals([{ ...clean, taxable: false }, oven], 0, 0, 88750).taxCents).toBe(0);
  });
  it("taxes only the taxable lines: 8.875% of $200 = $17.75", () => {
    const t = invoiceTotals([clean, oven], 0, 0, 88750);
    expect(t.taxCents).toBe(1775);
    expect(t.totalCents).toBe(25775);
  });
  it("takes the taxable lines' share of a discount before taxing", () => {
    // $10 off a $240 invoice: taxable share 20000/24000 -> 833 off, base 19167.
    const t = invoiceTotals([clean, oven], 1000, 0, 88750);
    expect(t.taxCents).toBe(1701);
    expect(t.totalCents).toBe(24701);
    // Matches the database test (14_invoices_payouts.sql: with-discount 1701/24701).
  });
  it("rounds half up to the cent", () => {
    expect(calcTaxCents({ subtotalCents: 1000, taxableCents: 1000, discountCents: 0, ratePpm: 88750 })).toBe(89); // 88.75 -> 89
    expect(calcTaxCents({ subtotalCents: 1000, taxableCents: 1000, discountCents: 0, ratePpm: 85000 })).toBe(85);
    expect(calcTaxCents({ subtotalCents: 10, taxableCents: 10, discountCents: 0, ratePpm: 45000 })).toBe(0); // 0.45c
    expect(calcTaxCents({ subtotalCents: 10, taxableCents: 10, discountCents: 0, ratePpm: 50000 })).toBe(1); // 0.5c rounds up
  });
  it("is zero for an empty invoice", () => {
    expect(calcTaxCents({ subtotalCents: 0, taxableCents: 0, discountCents: 0, ratePpm: 88750 })).toBe(0);
  });
});

describe("discount, deposit and balance", () => {
  it("flags a discount above the subtotal and a deposit above the total", () => {
    expect(invoiceTotals([clean], 25000, 0, 0).problems).toHaveLength(1);
    expect(invoiceTotals([clean], 0, 25000, 0).problems).toHaveLength(1);
    expect(invoiceTotals([clean], 0, 5000, 0).problems).toEqual([]);
  });
  it("tracks the balance and what is left of the deposit", () => {
    expect(balanceCents(25775, 5000)).toBe(20775);
    expect(balanceCents(25775, 30000)).toBe(0);
    expect(depositDueCents(5000, 0, 25775)).toBe(5000);
    expect(depositDueCents(5000, 2000, 25775)).toBe(3000);
    expect(depositDueCents(5000, 5000, 25775)).toBe(0);
    expect(depositDueCents(5000, 0, 3000)).toBe(3000); // never more than what is owed
  });
  it("offers the customer the deposit due and the full balance", () => {
    expect(payChoices({ totalCents: 25775, depositCents: 5000, paidCents: 0 })).toEqual({ depositDueCents: 5000, balanceCents: 25775 });
    expect(payChoices({ totalCents: 25775, depositCents: 5000, paidCents: 5000 })).toEqual({ depositDueCents: 0, balanceCents: 20775 });
  });
});

describe("tax rate input", () => {
  it("converts percent text to parts per million and back", () => {
    expect(percentToPpm("8.875")).toBe(88750);
    expect(percentToPpm("8.875%")).toBe(88750);
    expect(percentToPpm("0")).toBe(0);
    expect(percentToPpm("10")).toBe(100000);
    expect(percentToPpm("30")).toBe(300000);
    expect(ppmToPercent(88750)).toBe("8.875");
    expect(ppmToPercent(0)).toBe("0");
    expect(ppmToPercent(100000)).toBe("10");
  });
  it("rejects anything that isn't a rate up to 30%", () => {
    expect(percentToPpm("31")).toBeNull();
    expect(percentToPpm("-1")).toBeNull();
    expect(percentToPpm("abc")).toBeNull();
    expect(percentToPpm("8.87655")).toBeNull();
  });
  it("labels invoice numbers", () => {
    expect(invoiceNumberLabel(42)).toBe("INV-0042");
  });
});
