import { z } from "zod";
import { percentToPpm } from "@/lib/invoices";

// Inputs for the Invoices & Payouts actions. Money is always integer cents
// (the forms convert typed dollars before calling); dates are NY calendar
// dates (YYYY-MM-DD). The database re-checks every rule; these catch bad input early.

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const optionalDay = z.preprocess(blank, day.optional());
const cents = z.number().int().min(0).max(100_000_000);
const positiveCents = z.number().int().positive("Enter an amount above zero").max(100_000_000);
const timestamp = z.string().datetime({ offset: true });

export const PAYMENT_METHODS = ["cash", "zelle", "check", "ach", "other"] as const;
export const PAYOUT_METHODS = ["zelle", "ach", "check", "cash", "other"] as const;
export const methodLabel: Record<string, string> = { cash: "Cash", zelle: "Zelle", check: "Check", ach: "ACH", other: "Other", card: "Card" };

export const createFromJobSchema = z.object({ jobId: uuid });
export const createFromQuoteSchema = z.object({ quoteId: uuid });

export const invoiceLineSchema = z.object({
  description: z.string().trim().min(1, "Describe each line").max(300),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(9999),
  unitPriceCents: cents,
  taxable: z.boolean(),
  jobId: uuid.nullish(),
});
export const saveInvoiceSchema = z.object({
  invoiceId: uuid,
  expectedUpdatedAt: timestamp,
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line").max(100),
  discountCents: cents,
  depositCents: cents,
  dueOn: optionalDay,
  notes: optionalText(2000),
});
export const invoiceVersionSchema = z.object({ invoiceId: uuid, expectedUpdatedAt: timestamp });
export const invoiceIdSchema = z.object({ invoiceId: uuid });
export const voidInvoiceSchema = z.object({ invoiceId: uuid, reason: z.string().trim().min(3, "Say briefly why").max(500) });

export const recordPaymentSchema = z
  .object({
    invoiceId: uuid,
    amountCents: positiveCents,
    method: z.enum(PAYMENT_METHODS),
    reference: optionalText(200),
    receivedOn: optionalDay,
    requestId: uuid,
  })
  .refine((v) => !(v.method === "zelle" || v.method === "check") || Boolean(v.reference), {
    message: "Enter the Zelle or check reference",
    path: ["reference"],
  });
export const recordRefundSchema = z.object({ paymentId: uuid, amountCents: positiveCents, reason: optionalText(500), requestId: uuid });
export const markCollectedSchema = z.object({ invoiceId: uuid, note: z.string().trim().min(3, "Say how it was collected").max(500) });

export const cardLinkSchema = z
  .object({ contactId: uuid.optional(), accountId: uuid.optional() })
  .refine((v) => v.contactId || v.accountId, { message: "Pick a customer" });
export const chargeCardSchema = z.object({ invoiceId: uuid, amountCents: positiveCents.optional() });
export const removeCardSchema = z.object({ id: uuid });

export const payTokenSchema = z.string().regex(/^[0-9a-f]{64}$/, "Invalid link");
export const checkoutSchema = z.object({ token: payTokenSchema, choice: z.enum(["deposit", "balance"]), saveCard: z.boolean() });
export const cardSetupSchema = z.object({ token: payTokenSchema });

export const buildPayoutsSchema = z.object({ weekStart: day, subcontractorId: uuid.optional() });
export const payoutVersionSchema = z.object({ payoutId: uuid, expectedUpdatedAt: timestamp });
export const payoutIdSchema = z.object({ payoutId: uuid });
export const markPayoutPaidSchema = z.object({
  payoutId: uuid,
  method: z.enum(PAYOUT_METHODS),
  reference: z.string().trim().min(1, "Enter the payment reference").max(200),
  paidOn: optionalDay,
});
export const voidPayoutSchema = z.object({ payoutId: uuid, reason: z.string().trim().min(3, "Say briefly why").max(500) });

export const w9Schema = z.object({ subcontractorId: uuid });
export const MAX_W9_BYTES = 10 * 1024 * 1024;
export const W9_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export const documentIdSchema = z.object({ id: uuid });

export const settingsFormSchema = z.object({
  taxRate: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const ppm = percentToPpm(v === "" ? "0" : v);
      if (ppm === null) ctx.addIssue({ code: "custom", message: "Enter a rate like 8.875 (up to 30)" });
      return ppm ?? 0;
    }),
  defaultLineTaxable: z.boolean(),
  invoiceDueDays: z.number().int().min(0).max(120),
  thresholdCents: cents,
  warnPercent: z.number().int().min(1).max(100),
});

export type FinanceErrorCode = "stale" | "not_allowed" | "invalid" | "duplicate" | "forbidden" | "error";
export type FinanceResult<T extends object = object> = ({ ok: true } & T) | { ok: false; code: FinanceErrorCode; message: string };

export const invalid = (message: string): Extract<FinanceResult, { ok: false }> => ({ ok: false, code: "invalid", message });
export const notSignedIn: Extract<FinanceResult, { ok: false }> = { ok: false, code: "forbidden", message: "Not signed in" };

/** Maps a Postgres/PostgREST error to a result. KC00x messages are written for people; others are replaced. */
export function mapFinanceError(error: { code?: string; message?: string }): Extract<FinanceResult, { ok: false }> {
  const message = error.message ?? "";
  switch (error.code) {
    case "KC001":
      return { ok: false, code: "stale", message: "Someone else changed this. It has been refreshed." };
    case "KC004":
      return { ok: false, code: "not_allowed", message };
    case "KC005":
      return { ok: false, code: "invalid", message };
    case "KC010":
      return { ok: false, code: "duplicate", message };
    case "23505":
      return { ok: false, code: "duplicate", message: "That was already recorded." };
    case "42501":
      return { ok: false, code: "forbidden", message: "Only the owner or an admin can do this." };
    default:
      return { ok: false, code: "error", message: "That didn't work. Try again." };
  }
}
