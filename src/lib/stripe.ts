import "server-only";
import { z } from "zod";
import { assertTestModeKey, encodeForm, type FormValue } from "@/lib/stripe-form";

// Thin Stripe client over fetch, TEST MODE ONLY: assertTestModeKey refuses a
// live key. Every response is parsed with zod before it is used. The secret
// key is read from the environment here and nowhere else.

const API = "https://api.stripe.com/v1";

export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return url.replace(/\/$/, "");
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, schema: z.ZodType<T>, params: { [key: string]: FormValue } = {}, idempotencyKey?: string): Promise<T> {
  const key = assertTestModeKey(process.env.STRIPE_SECRET_KEY);
  const body = encodeForm(params);
  const res = await fetch(method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = z.object({ error: z.object({ message: z.string().optional(), code: z.string().optional() }) }).safeParse(json);
    throw new Error(err.success ? (err.data.error.message ?? `Stripe error ${res.status}`) : `Stripe error ${res.status}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error("Stripe returned an unexpected response");
  return parsed.data;
}

const sessionSchema = z.object({ id: z.string(), url: z.string().url().nullable() });
const customerSchema = z.object({ id: z.string() });
const cardSchema = z.object({ brand: z.string().nullable().optional(), last4: z.string().nullable().optional(), exp_month: z.number().nullable().optional(), exp_year: z.number().nullable().optional() });
const paymentMethodSchema = z.object({ id: z.string(), card: cardSchema.nullable().optional() });
const paymentIntentSchema = z.object({
  id: z.string(),
  status: z.string(),
  customer: z.string().nullable().optional(),
  latest_charge: z.string().nullable().optional(),
  payment_method: z.union([z.string(), paymentMethodSchema, z.null()]).optional(),
});
const setupIntentSchema = z.object({
  id: z.string(),
  customer: z.string().nullable().optional(),
  payment_method: z.union([z.string(), paymentMethodSchema, z.null()]).optional(),
});

export async function createCustomer(input: { name: string | null; metadata: Record<string, string> }): Promise<string> {
  const c = await call("POST", "/customers", customerSchema, { name: input.name, metadata: input.metadata });
  return c.id;
}

/** A hosted Checkout page for an invoice amount. With saveCard, the card is kept for future cleans. */
export async function createPaymentCheckout(input: {
  invoiceId: string;
  invoiceLabel: string;
  amountCents: number;
  customerId: string | null;
  saveCard: boolean;
  contactId: string | null;
  accountId: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const metadata = { invoice_id: input.invoiceId, save_card: input.saveCard ? "1" : "0", contact_id: input.contactId, account_id: input.accountId };
  const s = await call(
    "POST",
    "/checkout/sessions",
    sessionSchema,
    {
      mode: "payment",
      client_reference_id: input.invoiceId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer: input.customerId,
      customer_creation: input.customerId ? undefined : input.saveCard ? "always" : undefined,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: input.invoiceLabel } } }],
      metadata,
      payment_intent_data: { metadata, setup_future_usage: input.saveCard ? "off_session" : undefined },
    },
    `checkout-${input.invoiceId}-${input.amountCents}-${input.saveCard ? 1 : 0}-${Math.floor(Date.now() / 60000)}`,
  );
  if (!s.url) throw new Error("Stripe did not return a checkout link");
  return { id: s.id, url: s.url };
}

/** Checkout in setup mode: saves a card without charging it. */
export async function createSetupCheckout(input: {
  customerId: string;
  cardRequestId: string;
  contactId: string | null;
  accountId: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const s = await call("POST", "/checkout/sessions", sessionSchema, {
    mode: "setup",
    currency: "usd",
    customer: input.customerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { card_request_id: input.cardRequestId, contact_id: input.contactId, account_id: input.accountId },
    setup_intent_data: { metadata: { card_request_id: input.cardRequestId, contact_id: input.contactId, account_id: input.accountId } },
  });
  if (!s.url) throw new Error("Stripe did not return a checkout link");
  return { id: s.id, url: s.url };
}

/** Charges the saved card on the day of the clean. The payment is recorded when Stripe's webhook arrives. */
export async function chargeSavedCard(input: { customerId: string; paymentMethodId: string; amountCents: number; invoiceId: string; invoiceLabel: string }) {
  return call(
    "POST",
    "/payment_intents",
    paymentIntentSchema,
    {
      amount: input.amountCents,
      currency: "usd",
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      off_session: true,
      confirm: true,
      description: input.invoiceLabel,
      metadata: { invoice_id: input.invoiceId, save_card: "0" },
    },
    `charge-${input.invoiceId}-${input.amountCents}-${Math.floor(Date.now() / 60000)}`,
  );
}

export const retrievePaymentIntent = (id: string) => call("GET", `/payment_intents/${encodeURIComponent(id)}`, paymentIntentSchema, { expand: ["payment_method"] });
export const retrieveSetupIntent = (id: string) => call("GET", `/setup_intents/${encodeURIComponent(id)}`, setupIntentSchema, { expand: ["payment_method"] });
export const detachPaymentMethod = (id: string) => call("POST", `/payment_methods/${encodeURIComponent(id)}/detach`, z.object({ id: z.string() }));
