"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { financeContext } from "@/lib/finance-auth";
import { balanceCents, invoiceNumberLabel, payChoices } from "@/lib/invoices";
import { appUrl, chargeSavedCard, createCustomer, createPaymentCheckout, createSetupCheckout, detachPaymentMethod } from "@/lib/stripe";
import {
  cardLinkSchema,
  cardSetupSchema,
  chargeCardSchema,
  checkoutSchema,
  createFromJobSchema,
  createFromQuoteSchema,
  invalid,
  invoiceIdSchema,
  invoiceVersionSchema,
  mapFinanceError,
  markCollectedSchema,
  notSignedIn,
  recordPaymentSchema,
  recordRefundSchema,
  removeCardSchema,
  saveInvoiceSchema,
  voidInvoiceSchema,
  type FinanceResult,
} from "@/lib/schemas/finance";
import { z } from "zod";

// Every change runs through a database function (one transaction, role check,
// finance log). These actions validate input with zod, call the function as the
// signed-in user, and map the outcome. Nothing here writes a table directly.

const forbidden: Extract<FinanceResult, { ok: false }> = { ok: false, code: "forbidden", message: "Only the owner or an admin can do this." };
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form";

function refresh(invoiceId?: string) {
  revalidatePath("/invoices");
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/payouts");
  revalidatePath("/command-center");
}

export async function createInvoiceFromJob(input: unknown): Promise<FinanceResult<{ invoiceId: string }>> {
  const p = createFromJobSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("create_invoice_from_job", { p_job_id: p.data.jobId });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true, invoiceId: data };
}

export async function createInvoiceFromQuote(input: unknown): Promise<FinanceResult<{ invoiceId: string }>> {
  const p = createFromQuoteSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("create_invoice_from_quote", { p_quote_id: p.data.quoteId });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true, invoiceId: data };
}

export async function saveInvoice(input: unknown): Promise<FinanceResult<{ updatedAt: string }>> {
  const p = saveInvoiceSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const v = p.data;
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("save_invoice", {
    p_invoice_id: v.invoiceId,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_lines: v.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit_price_cents: l.unitPriceCents, taxable: l.taxable, job_id: l.jobId ?? null })),
    p_discount_cents: v.discountCents,
    p_deposit_cents: v.depositCents,
    p_due_on: v.dueOn as string,
    p_notes: v.notes as string,
  });
  if (error) return mapFinanceError(error);
  refresh(v.invoiceId);
  return { ok: true, updatedAt: data };
}

export async function sendInvoice(input: unknown): Promise<FinanceResult<{ updatedAt: string }>> {
  const p = invoiceVersionSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("send_invoice", { p_invoice_id: p.data.invoiceId, p_expected_updated_at: p.data.expectedUpdatedAt });
  if (error) return mapFinanceError(error);
  refresh(p.data.invoiceId);
  return { ok: true, updatedAt: data };
}

export async function voidInvoice(input: unknown): Promise<FinanceResult> {
  const p = voidInvoiceSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("void_invoice", { p_invoice_id: p.data.invoiceId, p_reason: p.data.reason });
  if (error) return mapFinanceError(error);
  refresh(p.data.invoiceId);
  return { ok: true };
}

export async function deleteInvoiceDraft(input: unknown): Promise<FinanceResult> {
  const p = invoiceIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("delete_invoice_draft", { p_invoice_id: p.data.invoiceId });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true };
}

export async function recordPayment(input: unknown): Promise<FinanceResult<{ paymentId: string }>> {
  const p = recordPaymentSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const v = p.data;
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("record_manual_payment", {
    p_invoice_id: v.invoiceId,
    p_amount_cents: v.amountCents,
    p_method: v.method,
    p_reference: v.reference as string,
    p_received_on: v.receivedOn as string,
    p_request_id: v.requestId,
  });
  if (error) return mapFinanceError(error);
  refresh(v.invoiceId);
  return { ok: true, paymentId: data };
}

/** Records a refund that was made by hand (Stripe dashboard, Zelle, check). Nothing is sent from here. */
export async function recordRefund(input: unknown): Promise<FinanceResult<{ refundId: string }>> {
  const p = recordRefundSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const v = p.data;
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("record_refund", {
    p_payment_id: v.paymentId,
    p_amount_cents: v.amountCents,
    p_reason: v.reason as string,
    p_request_id: v.requestId,
  });
  if (error) return mapFinanceError(error);
  refresh();
  return { ok: true, refundId: data };
}

export async function markInvoiceCollected(input: unknown): Promise<FinanceResult> {
  const p = markCollectedSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("mark_invoice_collected", { p_invoice_id: p.data.invoiceId, p_note: p.data.note });
  if (error) return mapFinanceError(error);
  refresh(p.data.invoiceId);
  return { ok: true };
}

export async function clearInvoiceCollected(input: unknown): Promise<FinanceResult> {
  const p = invoiceIdSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("clear_invoice_collected", { p_invoice_id: p.data.invoiceId });
  if (error) return mapFinanceError(error);
  refresh(p.data.invoiceId);
  return { ok: true };
}

// Cards on file ----------------------------------------------------------------

/** A link the customer opens to save a card (no charge). */
export async function createCardLink(input: unknown): Promise<FinanceResult<{ url: string }>> {
  const p = cardLinkSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("create_card_request", { p_contact_id: p.data.contactId as string, p_account_id: p.data.accountId as string });
  if (error) return mapFinanceError(error);
  return { ok: true, url: `${appUrl()}/card/${data}` };
}

/** Charges the customer's saved card for the invoice balance. The payment is recorded when Stripe confirms it. */
export async function chargeCardOnFile(input: unknown): Promise<FinanceResult<{ status: string }>> {
  const p = chargeCardSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return forbidden;
  const { data: inv, error: invError } = await ctx.supabase
    .from("invoices")
    .select("id, invoice_number, status, total_cents, amount_paid_cents")
    .eq("id", p.data.invoiceId)
    .maybeSingle();
  if (invError || !inv) return invalid("Invoice not found");
  if (inv.status !== "sent" && inv.status !== "partially_paid" && inv.status !== "overdue") return invalid(`Invoice ${invoiceNumberLabel(inv.invoice_number)} can't be charged right now`);
  const balance = balanceCents(inv.total_cents ?? 0, inv.amount_paid_cents);
  const amount = p.data.amountCents ?? balance;
  if (amount <= 0 || amount > balance) return invalid("That amount is more than the balance due");
  const { data: card } = await createAdminClient().rpc("default_card_for_invoice", { p_invoice_id: inv.id });
  const parsed = z.object({ payment_method_id: z.string(), customer_id: z.string() }).safeParse(card);
  if (!parsed.success) return invalid("No card on file for this customer");
  try {
    const pi = await chargeSavedCard({
      customerId: parsed.data.customer_id,
      paymentMethodId: parsed.data.payment_method_id,
      amountCents: amount,
      invoiceId: inv.id,
      invoiceLabel: `Invoice ${invoiceNumberLabel(inv.invoice_number)}`,
    });
    return { ok: true, status: pi.status };
  } catch (e) {
    return { ok: false, code: "error", message: e instanceof Error ? e.message : "The charge didn't go through" };
  }
}

export async function removeCardOnFile(input: unknown): Promise<FinanceResult> {
  const p = removeCardSchema.safeParse(input);
  if (!p.success) return invalid(firstIssue(p.error));
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { data, error } = await ctx.supabase.rpc("remove_payment_method", { p_id: p.data.id });
  if (error) return mapFinanceError(error);
  // Best effort: the local record is already gone.
  try {
    await detachPaymentMethod(data);
  } catch {
    /* the card may already be detached in Stripe */
  }
  refresh();
  return { ok: true };
}

// Public pay page (token in the link is the credential) ---------------------------

const payPageInvoice = z.object({
  id: z.string().uuid(),
  invoice_number: z.number().int(),
  status: z.string(),
  customer: z.string().nullable(),
  contact_id: z.string().uuid().nullable(),
  account_id: z.string().uuid().nullable(),
  stripe_customer_id: z.string().nullable(),
  total_cents: z.number().int(),
  deposit_cents: z.number().int(),
  amount_paid_cents: z.number().int(),
});

/** Starts a Stripe Checkout for what the customer chose. Amounts come from the database, never from the browser. */
export async function startCheckout(input: unknown): Promise<FinanceResult<{ url: string }>> {
  const p = checkoutSchema.safeParse(input);
  if (!p.success) return invalid("This payment link isn't valid");
  const db = createAdminClient();
  const { data, error } = await db.rpc("invoice_for_pay_token", { p_token: p.data.token });
  const inv = payPageInvoice.safeParse(data);
  if (error || !inv.success) return invalid("This payment link isn't valid");
  const i = inv.data;
  if (!["sent", "partially_paid", "overdue"].includes(i.status)) return invalid("This invoice can't be paid online right now");
  const choices = payChoices({ totalCents: i.total_cents, depositCents: i.deposit_cents, paidCents: i.amount_paid_cents });
  const amount = p.data.choice === "deposit" ? choices.depositDueCents : choices.balanceCents;
  if (amount <= 0) return invalid("Nothing is due on this invoice");
  try {
    let customerId = i.stripe_customer_id;
    if (!customerId && p.data.saveCard) {
      customerId = await createCustomer({ name: i.customer, metadata: { contact_id: i.contact_id ?? "", account_id: i.account_id ?? "" } });
      await db.rpc("stripe_link_customer", { p_contact_id: i.contact_id as string, p_account_id: i.account_id as string, p_customer_id: customerId });
    }
    const base = appUrl();
    const s = await createPaymentCheckout({
      invoiceId: i.id,
      invoiceLabel: `Invoice ${invoiceNumberLabel(i.invoice_number)}`,
      amountCents: amount,
      customerId,
      saveCard: p.data.saveCard,
      contactId: i.contact_id,
      accountId: i.account_id,
      successUrl: `${base}/pay/${p.data.token}?paid=1`,
      cancelUrl: `${base}/pay/${p.data.token}`,
    });
    return { ok: true, url: s.url };
  } catch (e) {
    return { ok: false, code: "error", message: e instanceof Error && /test mode/.test(e.message) ? e.message : "Online payment isn't available right now" };
  }
}

/** Starts Stripe Checkout in setup mode so a customer can save a card from a link. */
export async function startCardSetup(input: unknown): Promise<FinanceResult<{ url: string }>> {
  const p = cardSetupSchema.safeParse(input);
  if (!p.success) return invalid("This link isn't valid");
  const db = createAdminClient();
  const { data } = await db.rpc("card_request_for_token", { p_token: p.data.token });
  const req = z
    .object({ id: z.string().uuid(), contact_id: z.string().uuid().nullable(), account_id: z.string().uuid().nullable(), customer: z.string().nullable(), stripe_customer_id: z.string().nullable(), expired: z.boolean(), used: z.boolean() })
    .safeParse(data);
  if (!req.success) return invalid("This link isn't valid");
  if (req.data.expired || req.data.used) return invalid("This link has expired or was already used");
  try {
    let customerId = req.data.stripe_customer_id;
    if (!customerId) {
      customerId = await createCustomer({ name: req.data.customer, metadata: { contact_id: req.data.contact_id ?? "", account_id: req.data.account_id ?? "" } });
      await db.rpc("stripe_link_customer", { p_contact_id: req.data.contact_id as string, p_account_id: req.data.account_id as string, p_customer_id: customerId });
    }
    const base = appUrl();
    const s = await createSetupCheckout({
      customerId,
      cardRequestId: req.data.id,
      contactId: req.data.contact_id,
      accountId: req.data.account_id,
      successUrl: `${base}/card/${p.data.token}?saved=1`,
      cancelUrl: `${base}/card/${p.data.token}`,
    });
    return { ok: true, url: s.url };
  } catch (e) {
    return { ok: false, code: "error", message: e instanceof Error && /test mode/.test(e.message) ? e.message : "Saving a card isn't available right now" };
  }
}
