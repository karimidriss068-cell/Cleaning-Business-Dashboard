import { describe, expect, it, vi } from "vitest";
import { ghlContactSchema, ghlMessageSchema, ghlOpportunitySchema, type Notification } from "./schemas";
import { GhlError } from "./client";
import { drainQueue, handleNotification, reconcile, runOutbound } from "./sync";
import { fakeClient, fakeDb } from "./fake";

process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
const DAY = new Date("2026-07-15T18:00:00Z"); // 2pm New York
const NIGHT = new Date("2026-07-16T03:00:00Z"); // 11pm New York

const settings = { business_name: "Keystone Clean", max_texts_per_contact_per_day: 3, max_texts_per_hour: 30, stage_ids: { quoted: "s-quo", won: "s-won" }, opportunity_sync_mode: "dry_run", last_reconcile_at: null };
const due = (key = "review_request") => ({
  template_key: key, dedupe_key: `${key}:1`, contact_id: "contact-1", lead_id: null, job_id: "job-1", invoice_id: null,
  first_name: "Dana", ghl_contact_id: "ghl-c-1", event_at: "2026-07-15T14:00:00Z", pay_token: null,
});
const outboundDb = (mode: "dry_run" | "live", claim: Record<string, unknown>, counts = { contactDay: 0, hour: 0 }) =>
  fakeDb({
    tables: { ghl_settings: [settings], message_templates: [{ key: "review_request", body: "Hi {{first_name}}, from {{business}}. Reply STOP to opt out.", mode }] },
    rpc: { ghl_due_messages: () => [due()], ghl_send_counts: () => counts, ghl_claim_message: () => claim },
  });

describe("runOutbound", () => {
  it("dry-run: records what it would send and sends nothing", async () => {
    const { db, calls } = outboundDb("dry_run", { claimed: false, id: "m1", reason: "Dry run: nothing sent", dry_run: true });
    const client = fakeClient();
    const r = await runOutbound(db, client, DAY);
    expect(r).toMatchObject({ due: 1, dryRun: 1, sent: 0 });
    expect(calls("ghl_claim_message")[0]?.args).toMatchObject({ p_dry_run: true, p_body: "Hi Dana, from Keystone Clean. Reply STOP to opt out." });
    expect(client.sendSms).not.toHaveBeenCalled();
  });
  it("dry-run works with no GHL client at all", async () => {
    const { db } = outboundDb("dry_run", { claimed: false, dry_run: true, id: "m1" });
    expect((await runOutbound(db, null, DAY)).dryRun).toBe(1);
  });
  it("quiet hours: waits, claims nothing, sends nothing", async () => {
    const { db, calls } = outboundDb("live", { claimed: true, id: "m1" });
    const client = fakeClient();
    const r = await runOutbound(db, client, NIGHT);
    expect(r).toMatchObject({ due: 1, waiting: 1, sent: 0 });
    expect(calls("ghl_claim_message")).toHaveLength(0);
    expect(client.sendSms).not.toHaveBeenCalled();
  });
  it("rate limit: waits at the per-contact daily limit", async () => {
    const { db, calls } = outboundDb("live", { claimed: true, id: "m1" }, { contactDay: 3, hour: 3 });
    const r = await runOutbound(db, fakeClient(), DAY);
    expect(r.waiting).toBe(1);
    expect(calls("ghl_claim_message")).toHaveLength(0);
  });
  it("opt-out or no consent: the claim refuses, nothing is sent", async () => {
    const { db } = outboundDb("live", { claimed: false, id: "m1", reason: "opted out of texts", dry_run: false });
    const client = fakeClient();
    const r = await runOutbound(db, client, DAY);
    expect(r).toMatchObject({ blocked: 1, sent: 0 });
    expect(client.sendSms).not.toHaveBeenCalled();
  });
  it("a duplicate claim is not counted or sent", async () => {
    const { db } = outboundDb("live", { claimed: false, reason: "already handled" });
    const client = fakeClient();
    expect(await runOutbound(db, client, DAY)).toMatchObject({ blocked: 0, sent: 0 });
    expect(client.sendSms).not.toHaveBeenCalled();
  });
  it("live: sends the rendered text to the GHL contact and records it", async () => {
    const { db, calls } = outboundDb("live", { claimed: true, id: "m1" });
    const client = fakeClient();
    expect(await runOutbound(db, client, DAY)).toMatchObject({ sent: 1 });
    expect(client.sendSms).toHaveBeenCalledWith("ghl-c-1", "Hi Dana, from Keystone Clean. Reply STOP to opt out.");
    expect(calls("ghl_finish_message")[0]?.args).toMatchObject({ p_id: "m1", p_outcome: "sent", p_ghl_message_id: "msg-sent-1" });
  });
  it("live: a 503 is queued for retry; a 422 is failed for good", async () => {
    const a = outboundDb("live", { claimed: true, id: "m1" });
    await runOutbound(a.db, fakeClient({ sendSms: vi.fn(async () => { throw new GhlError("GHL answered 503", 503); }) }), DAY);
    expect(a.log.inserts[0]).toMatchObject({ table: "sync_queue", row: { operation: "send_sms", entity_id: "m1" } });
    expect(a.calls("ghl_finish_message")).toHaveLength(0);
    const b = outboundDb("live", { claimed: true, id: "m2" });
    await runOutbound(b.db, fakeClient({ sendSms: vi.fn(async () => { throw new GhlError("GHL answered 422", 422); }) }), DAY);
    expect(b.log.inserts).toHaveLength(0);
    expect(b.calls("ghl_finish_message")[0]?.args).toMatchObject({ p_outcome: "failed" });
  });
  it("builds the pay link from the invoice token", async () => {
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [settings], message_templates: [{ key: "payment_link", body: "Pay: {{pay_link}}", mode: "dry_run" }] },
      rpc: { ghl_due_messages: () => [{ ...due("payment_link"), pay_token: "tok123" }], ghl_send_counts: () => ({ contactDay: 0, hour: 0 }), ghl_claim_message: () => ({ dry_run: true, id: "x" }) },
    });
    await runOutbound(db, null, DAY);
    expect(calls("ghl_claim_message")[0]?.args.p_body).toBe("Pay: https://app.test/pay/tok123");
  });
});

describe("handleNotification acts on the record fetched from GHL", () => {
  const n = (over: Partial<Notification>): Notification => ({ event: "contact", eventId: "evt-12345678", sentAt: 1, contactId: "ghl-c-1", ...over });
  const contact = ghlContactSchema.parse({
    id: "ghl-c-1", firstName: "Dana", lastName: "Lee", phone: "(718) 555-0142", email: "Dana@Example.com", source: "Facebook",
    tags: ["sms-consent", "commercial"], attributions: [{ utmSource: "facebook", utmCampaign: "Spring", utmContent: "Reel A", isFirst: true }],
  });

  it("a contact event upserts from the fetched contact, with consent, UTM and the opportunity", async () => {
    const { db, calls } = fakeDb({ rpc: { ghl_upsert_lead: () => ({ created_lead: true, lead_id: "l1" }) } });
    const client = fakeClient({ getContact: vi.fn(async () => contact), opportunityForContact: vi.fn(async () => ghlOpportunitySchema.parse({ id: "ghl-o-1" })) });
    const out = await handleNotification(db, client, n({}));
    expect(out).toEqual({ handled: "lead created", createdLead: true });
    expect(calls("ghl_upsert_lead")[0]?.args).toMatchObject({
      p_ghl_contact_id: "ghl-c-1", p_phone: "(718) 555-0142", p_email: "Dana@Example.com", p_opportunity_id: "ghl-o-1",
      p_sms_consent: true, p_dnd: false, p_service_type: "commercial", p_utm: { source: "facebook", campaign: "Spring", content: "Reel A" },
    });
  });
  it("do-not-disturb in GHL is passed as an opt-out and withholds consent", async () => {
    const { db, calls } = fakeDb({ rpc: { ghl_upsert_lead: () => ({ created_lead: false }) } });
    const dnd = ghlContactSchema.parse({ id: "ghl-c-1", phone: "7185550142", tags: ["sms-consent"], dnd: true });
    await handleNotification(db, fakeClient({ getContact: vi.fn(async () => dnd) }), n({}));
    expect(calls("ghl_upsert_lead")[0]?.args).toMatchObject({ p_sms_consent: false, p_dnd: true });
  });
  it("a record GHL no longer has is skipped, not an error", async () => {
    const { db, calls } = fakeDb();
    expect(await handleNotification(db, fakeClient(), n({}))).toEqual({ handled: "skipped: contact not found in GHL" });
    expect(calls("ghl_upsert_lead")).toHaveLength(0);
  });
  it("a contact with no phone or email is skipped (no retry loop)", async () => {
    const { db } = fakeDb();
    db.rpc = (async () => ({ data: null, error: { code: "KC005", message: "this GHL contact has no valid phone or email" } })) as unknown as typeof db.rpc;
    const out = await handleNotification(db, fakeClient({ getContact: vi.fn(async () => contact) }), n({}));
    expect(out.handled).toMatch(/^skipped/);
  });
  it("an opportunity event applies the mapped stage", async () => {
    const { db, calls } = fakeDb({ tables: { ghl_settings: [settings] }, rpc: { ghl_upsert_lead: () => ({}), ghl_apply_stage: () => ({ applied: true }) } });
    const opp = ghlOpportunitySchema.parse({ id: "ghl-o-1", contactId: "ghl-c-1", status: "open", pipelineStageId: "s-quo" });
    const client = fakeClient({ getOpportunity: vi.fn(async () => opp), getContact: vi.fn(async () => contact) });
    const out = await handleNotification(db, client, n({ event: "opportunity", opportunityId: "ghl-o-1" }));
    expect(out.handled).toBe("stage quoted");
    expect(calls("ghl_apply_stage")[0]?.args).toMatchObject({ p_opportunity_id: "ghl-o-1", p_stage: "quoted" });
  });
  it("an opportunity in an unmapped stage changes nothing", async () => {
    const { db, calls } = fakeDb({ tables: { ghl_settings: [settings] } });
    const opp = ghlOpportunitySchema.parse({ id: "ghl-o-1", status: "open", pipelineStageId: "zzz" });
    const out = await handleNotification(db, fakeClient({ getOpportunity: vi.fn(async () => opp) }), n({ event: "opportunity", opportunityId: "ghl-o-1" }));
    expect(out.handled).toMatch(/not mapped/);
    expect(calls("ghl_apply_stage")).toHaveLength(0);
  });
  it("an inbound text from someone we don't know creates the lead, then logs the text", async () => {
    const { db, calls } = fakeDb({ rpc: { ghl_upsert_lead: () => ({ created_lead: true }), ghl_log_message: () => ({ logged: true }) } });
    const msg = ghlMessageSchema.parse({ id: "m-1", contactId: "ghl-c-1", body: "Can I get a quote?", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-07-15T18:00:00Z" });
    const out = await handleNotification(db, fakeClient({ getMessage: vi.fn(async () => msg), getContact: vi.fn(async () => contact) }), n({ event: "message", messageId: "m-1" }));
    expect(out).toMatchObject({ createdLead: true, handled: "inbound text logged" });
    expect(calls("ghl_log_message")[0]?.args).toMatchObject({ p_message_id: "m-1", p_direction: "inbound", p_body: "Can I get a quote?", p_automated: false });
  });
  it("a message we sent ourselves is logged as automated", async () => {
    const { db, calls } = fakeDb({ tables: { message_log: [{ id: "ours" }], contacts: [{ id: "c" }] }, rpc: { ghl_log_message: () => ({ logged: true }) } });
    const msg = ghlMessageSchema.parse({ id: "m-2", contactId: "ghl-c-1", body: "Thanks!", direction: "outbound", messageType: "TYPE_SMS" });
    await handleNotification(db, fakeClient({ getMessage: vi.fn(async () => msg) }), n({ event: "message", messageId: "m-2" }));
    expect(calls("ghl_log_message")[0]?.args).toMatchObject({ p_direction: "outbound", p_automated: true });
  });
  it("an email is not logged as a text", async () => {
    const { db, calls } = fakeDb({ tables: { contacts: [{ id: "c" }] } });
    const msg = ghlMessageSchema.parse({ id: "m-3", contactId: "ghl-c-1", body: "hi", direction: "inbound", messageType: "TYPE_EMAIL" });
    const out = await handleNotification(db, fakeClient({ getMessage: vi.fn(async () => msg) }), n({ event: "message", messageId: "m-3" }));
    expect(out.handled).toMatch(/not a text/);
    expect(calls("ghl_log_message")).toHaveLength(0);
  });
});

describe("drainQueue", () => {
  const row = (operation: string, entity_id = "lead-1") => ({ id: "q1", operation, entity_id, attempts: 1 });
  const lead = { stage: "quoted", ghl_opportunity_id: "ghl-o-1" };

  it("stage update in dry-run: finishes with a note and never calls GHL", async () => {
    const { db, calls } = fakeDb({ tables: { ghl_settings: [settings], leads: [lead] }, rpc: { ghl_claim_queue: () => [row("update_opportunity")] } });
    const client = fakeClient();
    const r = await drainQueue(db, client, DAY);
    expect(r.succeeded).toBe(1);
    expect(client.updateOpportunity).not.toHaveBeenCalled();
    expect(calls("ghl_queue_done")[0]?.args.p_note).toMatch(/^dry run/);
  });
  it("stage update live: moves the GHL opportunity to the mapped stage", async () => {
    const { db } = fakeDb({ tables: { ghl_settings: [{ ...settings, opportunity_sync_mode: "live" }], leads: [lead] }, rpc: { ghl_claim_queue: () => [row("update_opportunity")] } });
    const client = fakeClient();
    await drainQueue(db, client, DAY);
    expect(client.updateOpportunity).toHaveBeenCalledWith("ghl-o-1", { pipelineStageId: "s-quo", status: "open" });
  });
  it("a failure goes back through the backoff", async () => {
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [{ ...settings, opportunity_sync_mode: "live" }], leads: [lead] },
      rpc: { ghl_claim_queue: () => [row("update_opportunity")], ghl_queue_fail: () => "pending" },
    });
    const client = fakeClient({ updateOpportunity: vi.fn(async () => { throw new GhlError("GHL answered 429", 429); }) });
    const r = await drainQueue(db, client, DAY);
    expect(r.failed).toBe(1);
    expect(calls("ghl_queue_fail")[0]?.args).toMatchObject({ p_id: "q1", p_error: "GHL answered 429" });
  });
  it("a queued text waits out quiet hours without using an attempt", async () => {
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [settings], message_log: [{ id: "m1", outcome: "pending", body: "hi", contact_id: "c1" }] },
      rpc: { ghl_claim_queue: () => [row("send_sms", "m1")] },
    });
    const client = fakeClient();
    const r = await drainQueue(db, client, NIGHT);
    expect(r.deferred).toBe(1);
    expect(client.sendSms).not.toHaveBeenCalled();
    expect(calls("ghl_queue_defer")[0]?.args.p_until).toBe("2026-07-16T12:00:00.000Z");
  });
  it("a retried text re-checks consent and does not send to someone who opted out meanwhile", async () => {
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [settings], message_log: [{ id: "m1", outcome: "pending", body: "hi", contact_id: "c1" }] },
      rpc: { ghl_claim_queue: () => [row("send_sms", "m1")], ghl_can_text: () => "opted out of texts" },
    });
    const client = fakeClient();
    await drainQueue(db, client, DAY);
    expect(client.sendSms).not.toHaveBeenCalled();
    expect(calls("ghl_finish_message")[0]?.args).toMatchObject({ p_outcome: "failed", p_error: "not sent: opted out of texts" });
  });
  it("a retried text that now works is sent and recorded", async () => {
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [settings], contacts: [{ ghl_contact_id: "ghl-c-1" }], message_log: [{ id: "m1", outcome: "pending", body: "hi", contact_id: "c1" }] },
      rpc: { ghl_claim_queue: () => [row("send_sms", "m1")], ghl_can_text: () => null },
    });
    const client = fakeClient();
    await drainQueue(db, client, DAY);
    expect(client.sendSms).toHaveBeenCalledWith("ghl-c-1", "hi");
    expect(calls("ghl_finish_message")[0]?.args).toMatchObject({ p_outcome: "sent" });
  });
  it("the last failed attempt marks the text failed", async () => {
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [settings], contacts: [{ ghl_contact_id: "ghl-c-1" }], message_log: [{ id: "m1", outcome: "pending", body: "hi", contact_id: "c1" }] },
      rpc: { ghl_claim_queue: () => [row("send_sms", "m1")], ghl_can_text: () => null, ghl_queue_fail: () => "dead" },
    });
    await drainQueue(db, fakeClient({ sendSms: vi.fn(async () => { throw new GhlError("GHL answered 500", 500); }) }), DAY);
    expect(calls("ghl_finish_message")[0]?.args).toMatchObject({ p_outcome: "failed" });
  });
});

describe("reconcile", () => {
  const now = new Date("2026-11-04T15:00:00Z");
  it("refreshes known contacts, recovers a new one the webhook missed, and records the run", async () => {
    const known = ghlContactSchema.parse({ id: "known", phone: "7185550142", dateAdded: "2026-01-01T00:00:00Z" });
    const fresh = ghlContactSchema.parse({ id: "fresh", phone: "7185550199", dateAdded: "2026-11-04T14:30:00Z" });
    const { db, calls } = fakeDb({
      tables: { ghl_settings: [{ ...settings, last_reconcile_at: "2026-11-04T14:00:00Z" }] },
      rpc: { ghl_refresh_contact: (a) => a.p_ghl_contact_id === "known", ghl_upsert_lead: () => ({ created_lead: true }) },
    });
    const client = fakeClient({ recentContacts: vi.fn(async () => [known, fresh]) });
    const r = await reconcile(db, client, now);
    expect(r).toMatchObject({ contacts: 2, leadsCreated: 1, errors: 0 });
    expect(calls("ghl_upsert_lead")).toHaveLength(1);
    expect(calls("ghl_upsert_lead")[0]?.args.p_ghl_contact_id).toBe("fresh");
    expect(calls("ghl_touch")[0]?.args).toMatchObject({ p_what: "reconcile" });
    // looks back from the last run minus the overlap
    expect(client.recentContacts).toHaveBeenCalledWith(new Date("2026-11-04T13:45:00Z"), 100);
  });
  it("is idempotent: the same record twice does the same upserts", async () => {
    const fresh = ghlContactSchema.parse({ id: "fresh", phone: "7185550199", dateAdded: "2026-11-04T14:30:00Z" });
    const mk = () => fakeDb({ tables: { ghl_settings: [{ ...settings, last_reconcile_at: "2026-11-04T14:00:00Z" }] }, rpc: { ghl_refresh_contact: () => false, ghl_upsert_lead: () => ({ created_lead: false }) } });
    const a = mk();
    const b = mk();
    await reconcile(a.db, fakeClient({ recentContacts: vi.fn(async () => [fresh]) }), now);
    await reconcile(b.db, fakeClient({ recentContacts: vi.fn(async () => [fresh]) }), now);
    expect(a.calls("ghl_upsert_lead")).toEqual(b.calls("ghl_upsert_lead"));
  });
  it("one bad record doesn't stop the rest, and is counted", async () => {
    const good = ghlContactSchema.parse({ id: "good" });
    const { db } = fakeDb({ tables: { ghl_settings: [settings] }, rpc: { ghl_refresh_contact: () => true } });
    let n = 0;
    db.rpc = (async (name: string) => {
      if (name === "ghl_refresh_contact" && n++ === 0) return { data: null, error: { code: "XX000", message: "boom" } };
      return { data: true, error: null };
    }) as unknown as typeof db.rpc;
    const r = await reconcile(db, fakeClient({ recentContacts: vi.fn(async () => [good, good]) }), now);
    expect(r).toMatchObject({ contacts: 1, errors: 1 });
  });
});
