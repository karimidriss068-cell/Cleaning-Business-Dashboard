import { describe, expect, it } from "vitest";
import {
  checkoutSchema,
  mapFinanceError,
  markPayoutPaidSchema,
  recordPaymentSchema,
  saveInvoiceSchema,
  settingsFormSchema,
} from "./finance";

const id = "5eed0000-0000-4000-8000-000000000001";
const ts = "2026-11-01T14:00:00.000Z";

describe("recordPaymentSchema", () => {
  const base = { invoiceId: id, amountCents: 5000, method: "cash", requestId: id } as const;
  it("takes integer cents and a request id", () => {
    expect(recordPaymentSchema.safeParse(base).success).toBe(true);
    expect(recordPaymentSchema.safeParse({ ...base, amountCents: 50.5 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, amountCents: -5 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, requestId: "nope" }).success).toBe(false);
  });
  it("needs a reference for Zelle and check, not for cash", () => {
    expect(recordPaymentSchema.safeParse({ ...base, method: "zelle" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: "check", reference: "  " }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: "zelle", reference: "ZEL-1" }).success).toBe(true);
  });
  it("refuses card (cards go through Stripe)", () => {
    expect(recordPaymentSchema.safeParse({ ...base, method: "card" }).success).toBe(false);
  });
});

describe("saveInvoiceSchema", () => {
  const line = { description: "Standard clean", quantity: 1, unitPriceCents: 20000, taxable: false };
  const base = { invoiceId: id, expectedUpdatedAt: ts, lines: [line], discountCents: 0, depositCents: 0 };
  it("requires at least one line and integer cents", () => {
    expect(saveInvoiceSchema.safeParse(base).success).toBe(true);
    expect(saveInvoiceSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(saveInvoiceSchema.safeParse({ ...base, lines: [{ ...line, unitPriceCents: 19.99 }] }).success).toBe(false);
    expect(saveInvoiceSchema.safeParse({ ...base, lines: [{ ...line, description: " " }] }).success).toBe(false);
    expect(saveInvoiceSchema.safeParse({ ...base, lines: [{ ...line, quantity: 0 }] }).success).toBe(false);
  });
  it("turns blank optional text and dates into undefined", () => {
    const r = saveInvoiceSchema.parse({ ...base, notes: "  ", dueOn: "" });
    expect(r.notes).toBeUndefined();
    expect(r.dueOn).toBeUndefined();
  });
});

describe("markPayoutPaidSchema", () => {
  it("needs a reference", () => {
    expect(markPayoutPaidSchema.safeParse({ payoutId: id, method: "zelle", reference: "" }).success).toBe(false);
    expect(markPayoutPaidSchema.safeParse({ payoutId: id, method: "zelle", reference: "CONF-77" }).success).toBe(true);
    expect(markPayoutPaidSchema.safeParse({ payoutId: id, method: "card", reference: "x" }).success).toBe(false);
  });
});

describe("settingsFormSchema", () => {
  const base = { taxRate: "8.875", defaultLineTaxable: false, invoiceDueDays: 14, thresholdCents: 200000, warnPercent: 80 };
  it("converts the tax rate to parts per million", () => {
    expect(settingsFormSchema.parse(base).taxRate).toBe(88750);
    expect(settingsFormSchema.parse({ ...base, taxRate: "" }).taxRate).toBe(0);
  });
  it("rejects a rate that isn't one", () => {
    expect(settingsFormSchema.safeParse({ ...base, taxRate: "abc" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...base, taxRate: "45" }).success).toBe(false);
  });
});

describe("pay page input", () => {
  it("accepts only a 64-character hex token", () => {
    const token = "a".repeat(64);
    expect(checkoutSchema.safeParse({ token, choice: "balance", saveCard: false }).success).toBe(true);
    expect(checkoutSchema.safeParse({ token: "short", choice: "balance", saveCard: false }).success).toBe(false);
    expect(checkoutSchema.safeParse({ token, choice: "everything", saveCard: false }).success).toBe(false);
  });
});

describe("mapFinanceError", () => {
  it("passes our own messages through and hides everything else", () => {
    expect(mapFinanceError({ code: "KC005", message: "that is more than the balance due" })).toEqual({ ok: false, code: "invalid", message: "that is more than the balance due" });
    expect(mapFinanceError({ code: "KC004", message: "invoice 3 is void" }).code).toBe("not_allowed");
    expect(mapFinanceError({ code: "KC001" }).code).toBe("stale");
    expect(mapFinanceError({ code: "KC010", message: "this visit is already on invoice #4" }).code).toBe("duplicate");
    expect(mapFinanceError({ code: "23505", message: "duplicate key ... secret detail" }).message).toBe("That was already recorded.");
    const generic = mapFinanceError({ code: "XX000", message: "relation foo exploded" });
    expect(generic.message).not.toContain("exploded");
  });
});
