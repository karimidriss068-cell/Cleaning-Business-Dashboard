import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { assertTestModeKey, encodeForm } from "./stripe-form";
import { eventEnvelope, processStripeEvent, type StripeEvent, type StripeLookups } from "./stripe-events";

describe("encodeForm", () => {
  it("nests objects and arrays the way Stripe expects, skipping empty values", () => {
    expect(
      encodeForm({
        mode: "payment",
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 2500 } }],
        metadata: { invoice_id: "abc", contact_id: null, account_id: undefined },
        off_session: true,
      }),
    ).toBe("mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=usd&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2500&metadata%5Binvoice_id%5D=abc&off_session=true");
  });
  it("encodes special characters", () => {
    expect(encodeForm({ description: "A&B = C" })).toBe("description=A%26B%20%3D%20C");
  });
});

describe("test mode only", () => {
  it("accepts test keys and refuses live or missing keys", () => {
    expect(assertTestModeKey("sk_test_abc123")).toBe("sk_test_abc123");
    expect(assertTestModeKey("rk_test_abc123")).toBe("rk_test_abc123");
    expect(() => assertTestModeKey("sk_live_abc123")).toThrow(/test mode only/);
    expect(() => assertTestModeKey("rk_live_abc123")).toThrow(/test mode only/);
    expect(() => assertTestModeKey("pk_test_abc123")).toThrow(/test mode only/);
    expect(() => assertTestModeKey(undefined)).toThrow(/not set/);
  });
});

const INVOICE = "5eed0000-0000-4000-8000-000000000001";
const event = (type: string, object: Record<string, unknown>): StripeEvent => ({ id: "evt_1", type, livemode: false, data: { object } });

function fakeDb(result: { error: { code?: string } | null } = { error: null }) {
  const rpc = vi.fn(async () => ({ data: null, error: result.error }));
  return { db: { rpc } as unknown as SupabaseClient<Database>, rpc };
}
const lookups: StripeLookups = {
  retrievePaymentIntent: vi.fn(async (id: string) => ({ id, customer: "cus_1", payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } } })),
  retrieveSetupIntent: vi.fn(async (id: string) => ({ id, customer: "cus_1", payment_method: { id: "pm_2", card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2031 } } })),
};

describe("event envelope", () => {
  it("requires an id, type, livemode flag and object", () => {
    expect(eventEnvelope.safeParse({ id: "evt", type: "x", livemode: false, data: { object: {} } }).success).toBe(true);
    expect(eventEnvelope.safeParse({ type: "x", livemode: false, data: { object: {} } }).success).toBe(false);
    expect(eventEnvelope.safeParse({ id: "e", type: "x", data: { object: {} } }).success).toBe(false);
    expect(eventEnvelope.safeParse("nope").success).toBe(false);
  });
});

describe("processStripeEvent", () => {
  it("records a paid checkout against its invoice by payment intent", async () => {
    const { db, rpc } = fakeDb();
    const out = await processStripeEvent(
      db,
      event("checkout.session.completed", { id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 20775, metadata: { invoice_id: INVOICE, save_card: "0" } }),
      lookups,
    );
    expect(out.handled).toBe(true);
    expect(rpc).toHaveBeenCalledWith("stripe_record_payment", expect.objectContaining({ p_invoice_id: INVOICE, p_amount_cents: 20775, p_payment_intent: "pi_1", p_checkout_session: "cs_1" }));
  });
  it("also saves the card when the customer asked to", async () => {
    const { db, rpc } = fakeDb();
    await processStripeEvent(
      db,
      event("checkout.session.completed", {
        id: "cs_1", mode: "payment", payment_status: "paid", payment_intent: "pi_1", amount_total: 100, customer: "cus_1",
        metadata: { invoice_id: INVOICE, save_card: "1", contact_id: "5eed0000-0000-4000-8000-0000000000c1" },
      }),
      lookups,
    );
    expect(rpc).toHaveBeenCalledWith("stripe_save_card", expect.objectContaining({ p_payment_method_id: "pm_1", p_last4: "4242" }));
  });
  it("ignores an unpaid session and a payment with no invoice", async () => {
    const { db, rpc } = fakeDb();
    expect((await processStripeEvent(db, event("checkout.session.completed", { id: "cs", mode: "payment", payment_status: "unpaid", payment_intent: "pi" }), lookups)).handled).toBe(false);
    expect((await processStripeEvent(db, event("payment_intent.succeeded", { id: "pi", amount_received: 500, metadata: {} }), lookups)).handled).toBe(false);
    expect((await processStripeEvent(db, event("payment_intent.succeeded", { id: "pi", amount_received: 500, metadata: { invoice_id: "not-a-uuid" } }), lookups)).handled).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("records an off-session charge from payment_intent.succeeded", async () => {
    const { db, rpc } = fakeDb();
    await processStripeEvent(db, event("payment_intent.succeeded", { id: "pi_9", amount_received: 15000, latest_charge: "ch_9", metadata: { invoice_id: INVOICE } }), lookups);
    expect(rpc).toHaveBeenCalledWith("stripe_record_payment", expect.objectContaining({ p_payment_intent: "pi_9", p_charge: "ch_9", p_amount_cents: 15000 }));
  });
  it("records a finished refund and waits for an unfinished one", async () => {
    const { db, rpc } = fakeDb();
    await processStripeEvent(db, event("refund.created", { id: "re_1", amount: 1000, status: "succeeded", payment_intent: "pi_1" }), lookups);
    expect(rpc).toHaveBeenCalledWith("stripe_record_refund", { p_payment_intent: "pi_1", p_refund_id: "re_1", p_amount_cents: 1000 });
    rpc.mockClear();
    expect((await processStripeEvent(db, event("refund.created", { id: "re_2", amount: 1000, status: "pending", payment_intent: "pi_1" }), lookups)).handled).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves a card from a setup-mode checkout", async () => {
    const { db, rpc } = fakeDb();
    await processStripeEvent(
      db,
      event("checkout.session.completed", { id: "cs_s", mode: "setup", setup_intent: "seti_1", metadata: { card_request_id: "5eed0000-0000-4000-8000-0000000000d1", contact_id: "5eed0000-0000-4000-8000-0000000000c1" } }),
      lookups,
    );
    expect(rpc).toHaveBeenCalledWith("stripe_save_card", expect.objectContaining({ p_payment_method_id: "pm_2", p_exp_year: 2031 }));
  });
  it("throws when the database write fails, so the route answers 5xx and Stripe retries", async () => {
    const { db } = fakeDb({ error: { code: "XX000" } });
    await expect(
      processStripeEvent(db, event("payment_intent.succeeded", { id: "pi_1", amount_received: 100, metadata: { invoice_id: INVOICE } }), lookups),
    ).rejects.toThrow(/stripe_record_payment failed/);
  });
  it("ignores event types it doesn't handle", async () => {
    const { db, rpc } = fakeDb();
    expect((await processStripeEvent(db, event("customer.created", { id: "cus_1" }), lookups)).note).toBe("ignored event type");
    expect(rpc).not.toHaveBeenCalled();
  });
});
