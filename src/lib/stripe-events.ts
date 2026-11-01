import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

// Turns a verified Stripe event into database writes. Everything it writes is
// idempotent on Stripe's own ids (payment intent, refund, payment method), on
// top of the webhook_events claim the route makes first. Stripe calls are
// injected so this can be tested without the network.

export const eventEnvelope = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(200),
  livemode: z.boolean(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});
export type StripeEvent = z.infer<typeof eventEnvelope>;

const uuid = z.string().uuid();
const meta = z.record(z.string(), z.string().nullable()).nullable().optional();

const checkoutSession = z.object({
  id: z.string(),
  mode: z.string(),
  payment_status: z.string().optional(),
  payment_intent: z.string().nullable().optional(),
  setup_intent: z.string().nullable().optional(),
  amount_total: z.number().int().nullable().optional(),
  customer: z.string().nullable().optional(),
  metadata: meta,
});
const paymentIntentObject = z.object({
  id: z.string(),
  amount_received: z.number().int().optional(),
  latest_charge: z.string().nullable().optional(),
  customer: z.string().nullable().optional(),
  metadata: meta,
});
const refundObject = z.object({
  id: z.string(),
  amount: z.number().int(),
  status: z.string().nullable().optional(),
  payment_intent: z.string().nullable().optional(),
});

type PaymentMethodLike = string | { id: string; card?: { brand?: string | null; last4?: string | null; exp_month?: number | null; exp_year?: number | null } | null } | null | undefined;
export type StripeLookups = {
  retrievePaymentIntent: (id: string) => Promise<{ id: string; customer?: string | null; payment_method?: PaymentMethodLike }>;
  retrieveSetupIntent: (id: string) => Promise<{ id: string; customer?: string | null; payment_method?: PaymentMethodLike }>;
};

export type EventOutcome = { handled: boolean; note: string };

async function saveCard(
  db: SupabaseClient<Database>,
  args: { customerId: string | null | undefined; method: PaymentMethodLike; contactId: string | null; accountId: string | null; cardRequestId: string | null },
): Promise<EventOutcome> {
  const m = args.method;
  if (!m || typeof m === "string" || !args.customerId || (!args.contactId && !args.accountId)) return { handled: false, note: "card details incomplete" };
  const { error } = await db.rpc("stripe_save_card", {
    p_contact_id: args.contactId as string,
    p_account_id: args.accountId as string,
    p_customer_id: args.customerId,
    p_payment_method_id: m.id,
    p_brand: (m.card?.brand ?? null) as string,
    p_last4: (m.card?.last4 ?? null) as string,
    p_exp_month: (m.card?.exp_month ?? null) as number,
    p_exp_year: (m.card?.exp_year ?? null) as number,
    p_card_request_id: args.cardRequestId as string,
  });
  if (error) throw new Error(`stripe_save_card failed: ${error.code ?? ""}`);
  return { handled: true, note: "card saved" };
}

const idOrNull = (v: string | null | undefined): string | null => {
  const p = uuid.safeParse(v);
  return p.success ? p.data : null;
};

/** Throws on a transient failure (the route answers 5xx so Stripe retries); returns for anything handled or deliberately ignored. */
export async function processStripeEvent(db: SupabaseClient<Database>, event: StripeEvent, stripe: StripeLookups): Promise<EventOutcome> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = checkoutSession.safeParse(event.data.object);
      if (!s.success) return { handled: false, note: "unreadable session" };
      const session = s.data;
      const md = session.metadata ?? {};
      if (session.mode === "setup" && session.setup_intent) {
        const si = await stripe.retrieveSetupIntent(session.setup_intent);
        return saveCard(db, {
          customerId: si.customer ?? session.customer,
          method: si.payment_method,
          contactId: idOrNull(md.contact_id),
          accountId: idOrNull(md.account_id),
          cardRequestId: idOrNull(md.card_request_id),
        });
      }
      if (session.mode === "payment" && session.payment_status === "paid" && session.payment_intent) {
        const invoiceId = idOrNull(md.invoice_id);
        if (!invoiceId || !session.amount_total) return { handled: false, note: "no invoice on this payment" };
        const { error } = await db.rpc("stripe_record_payment", {
          p_invoice_id: invoiceId,
          p_amount_cents: session.amount_total,
          p_payment_intent: session.payment_intent,
          p_charge: null as unknown as string,
          p_checkout_session: session.id,
        });
        if (error) throw new Error(`stripe_record_payment failed: ${error.code ?? ""}`);
        if (md.save_card === "1") {
          const pi = await stripe.retrievePaymentIntent(session.payment_intent);
          await saveCard(db, {
            customerId: pi.customer ?? session.customer,
            method: pi.payment_method,
            contactId: idOrNull(md.contact_id),
            accountId: idOrNull(md.account_id),
            cardRequestId: null,
          });
        }
        return { handled: true, note: "payment recorded" };
      }
      return { handled: false, note: "nothing to record" };
    }
    case "payment_intent.succeeded": {
      const p = paymentIntentObject.safeParse(event.data.object);
      if (!p.success) return { handled: false, note: "unreadable payment intent" };
      const invoiceId = idOrNull((p.data.metadata ?? {}).invoice_id);
      if (!invoiceId || !p.data.amount_received) return { handled: false, note: "no invoice on this payment" };
      const { error } = await db.rpc("stripe_record_payment", {
        p_invoice_id: invoiceId,
        p_amount_cents: p.data.amount_received,
        p_payment_intent: p.data.id,
        p_charge: (p.data.latest_charge ?? null) as string,
        p_checkout_session: null as unknown as string,
      });
      if (error) throw new Error(`stripe_record_payment failed: ${error.code ?? ""}`);
      return { handled: true, note: "payment recorded" };
    }
    case "refund.created":
    case "refund.updated": {
      const r = refundObject.safeParse(event.data.object);
      if (!r.success || !r.data.payment_intent) return { handled: false, note: "unreadable refund" };
      if (r.data.status !== "succeeded") return { handled: false, note: "refund not complete yet" };
      const { error } = await db.rpc("stripe_record_refund", {
        p_payment_intent: r.data.payment_intent,
        p_refund_id: r.data.id,
        p_amount_cents: r.data.amount,
      });
      if (error) throw new Error(`stripe_record_refund failed: ${error.code ?? ""}`);
      return { handled: true, note: "refund recorded" };
    }
    default:
      return { handled: false, note: "ignored event type" };
  }
}
