/**
 * GoHighLevel integration end-to-end test. Needs no GHL account and no pasted logins: it starts
 * a FAKE GHL on this machine, starts the built app pointed at it with fake keys, and talks to the
 * cleaning project's database with the service role (the script refuses any other project).
 *
 *   npm run build
 *   npm run e2e:ghl
 *
 * Part A (HTTP): the webhook (secret, validation, replay window, duplicate events, re-fetching by id),
 * a new lead with UTM and consent, a text in, a human reply (first-response time), STOP, stage
 * changes both ways (no echo, dry-run then live, backoff), instant-reply texts (dry-run, consent,
 * opt-out, quiet hours, retry), and the reconciliation (recovers a missed lead, idempotent).
 * Part B (browser): signs in as a temporary seed-tagged admin and staff user it creates and deletes,
 * checks /settings/integrations, the dry-run to live confirm, retrying a failed sync, the Command
 * Center card, staff lockout, and every direction x theme at 1440px and 390px.
 * Everything it adds is removed, and the settings it touches are put back.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3144;
const GHL_PORT = 3190;
const base = `http://localhost:${PORT}`;
const SECRET = randomBytes(32).toString("hex");
const CRON = `e2e-${randomBytes(12).toString("hex")}`;
const LOCATION = "loc_e2e";
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nyHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const quiet = () => nyHour() >= 21 || nyHour() < 8;
const t0 = new Date().toISOString();
const PHONES = ["+13325550190", "+13325550191", "+13325550192", "+13325550193", "+13325550194", "+13325550195"];
const CAMPAIGN = "E2E-GHL campaign";

// ------------------------------------------------------------------ a fake GHL
const ghl = {
  contacts: new Map(), opps: new Map(), messages: new Map(), sms: [], puts: [],
  failSms: false, failPut: false, failContact: false, counter: 0,
};
const fake = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const parts = u.pathname.split("/").filter(Boolean);
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.headers.authorization !== "Bearer fake-ghl-token") return send(401, {});
    if (req.method === "GET" && parts[0] === "contacts" && parts[1]) {
      if (ghl.failContact) return send(500, {});
      const c = ghl.contacts.get(parts[1]);
      return c ? send(200, { contact: c }) : send(404, {});
    }
    if (req.method === "POST" && u.pathname === "/contacts/search") return send(200, { contacts: [...ghl.contacts.values()] });
    if (req.method === "GET" && u.pathname === "/opportunities/search") {
      const cid = u.searchParams.get("contact_id");
      return send(200, { opportunities: [...ghl.opps.values()].filter((o) => !cid || o.contactId === cid) });
    }
    if (req.method === "GET" && parts[0] === "opportunities" && parts[1]) {
      const o = ghl.opps.get(parts[1]);
      return o ? send(200, { opportunity: o }) : send(404, {});
    }
    if (req.method === "PUT" && parts[0] === "opportunities") {
      if (ghl.failPut) return send(503, {});
      ghl.puts.push({ id: parts[1], body: JSON.parse(raw) });
      return send(200, {});
    }
    if (req.method === "GET" && parts[0] === "conversations" && parts[1] === "messages" && parts[2]) {
      const m = ghl.messages.get(parts[2]);
      return m ? send(200, m) : send(404, {});
    }
    if (req.method === "POST" && u.pathname === "/conversations/messages") {
      if (ghl.failSms) return send(503, {});
      const body = JSON.parse(raw);
      ghl.sms.push(body);
      return send(200, { messageId: `fake-msg-${++ghl.counter}`, conversationId: "cv" });
    }
    if (req.method === "GET" && u.pathname === "/conversations/search") return send(200, { conversations: [] });
    return send(404, {});
  });
});
await new Promise((r) => fake.listen(GHL_PORT, "127.0.0.1", r));

const contact = (id, phone, over = {}) => ({
  id, firstName: "E2E", lastName: id.slice(-2), phone, email: `${id}@example.com`, source: "Facebook", tags: [], dnd: false,
  attributions: [{ utmSource: "facebook", utmCampaign: CAMPAIGN, utmContent: "E2E Reel", isFirst: true }],
  dateAdded: new Date().toISOString(), dateUpdated: new Date().toISOString(), ...over,
});

// ------------------------------------------------------------------ helpers
function runSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-ghl-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, sql);
  try {
    for (let i = 0; i < 3; i++) {
      const res = spawnSync("scripts/supabase-cleaning.sh", ["db", "query", "-f", file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
      if (res.status === 0 && !/ERROR:/.test(out)) return;
      if (/ERROR:/.test(out)) throw new Error(`cleanup SQL failed: ${out.slice(out.indexOf("ERROR:"), out.indexOf("ERROR:") + 300)}`);
    }
    throw new Error("cleanup SQL could not run (network)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const { data: settingsBefore } = await db.from("ghl_settings").select("*").single();
const { data: templatesBefore } = await db.from("message_templates").select("key, body, mode");
const users = [];

async function cleanup() {
  const phones = PHONES.map((p) => `'${p}'`).join(",");
  runSql(`begin;
delete from public.sync_queue where provider = 'ghl' and created_at >= '${t0}';
delete from public.webhook_events where provider = 'ghl' and event_id like 'e2e-ghl-%';
delete from public.message_log where contact_id in (select id from public.contacts where ghl_contact_id like 'e2e-ghl-%');
delete from public.opt_outs where value in (select phone from public.contacts where ghl_contact_id like 'e2e-ghl-%')
  or (value in (${phones}) and value not in (select phone from public.contacts where phone is not null and ghl_contact_id is null));
delete from public.leads where contact_id in (select id from public.contacts where ghl_contact_id like 'e2e-ghl-%');
delete from public.contacts where ghl_contact_id like 'e2e-ghl-%';
delete from public.marketing_campaigns where name = '${CAMPAIGN}';
delete from public.finance_log where entity = 'ghl' and occurred_at >= '${t0}';
commit;`);
  const restore = { ...settingsBefore };
  for (const k of ["id", "updated_at"]) delete restore[k];
  await db.from("ghl_settings").update(restore).eq("id", true);
  for (const t of templatesBefore ?? []) await db.from("message_templates").update({ body: t.body, mode: t.mode }).eq("key", t.key);
  for (const u of users) {
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
}
await cleanup(); // leftovers of an aborted run
// The test numbers must not belong to anyone else: the upsert matches people by phone.
const { data: taken } = await db.from("contacts").select("id").in("phone", PHONES);
if (taken?.length) throw new Error("refusing: a test phone number already belongs to a real or demo contact");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env, NEXT_PUBLIC_APP_URL: base, GHL_API_BASE: `http://127.0.0.1:${GHL_PORT}`, GHL_API_TOKEN: "fake-ghl-token",
    GHL_LOCATION_ID: LOCATION, GHL_WEBHOOK_SECRET: SECRET, CRON_SECRET: CRON,
  },
  stdio: "ignore",
});
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

let n = 0;
const event = (type, ids, over = {}) => ({ event: type, eventId: `e2e-ghl-${++n}-${randomBytes(4).toString("hex")}`, sentAt: Date.now(), ...ids, ...over });
const post = (body, headers = { "x-ghl-webhook-secret": SECRET }, raw) =>
  fetch(`${base}/api/webhooks/ghl`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) });
const cron = async (reconcileDue = true) => {
  if (reconcileDue) await db.from("ghl_settings").update({ last_reconcile_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("id", true);
  const r = await fetch(`${base}/api/cron/ghl-sync`, { headers: { authorization: `Bearer ${CRON}` } });
  return { status: r.status, body: await r.json() };
};
const leadOf = async (ghlContactId) => {
  const { data: c } = await db.from("contacts").select("id, phone, sms_consent, ghl_contact_id").eq("ghl_contact_id", ghlContactId).maybeSingle();
  if (!c) return { c: null, l: null };
  const { data: l } = await db.from("leads").select("*").eq("contact_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return { c, l };
};
const waitFor = async (fn, ms = 10000) => {
  for (let t = 0; t < ms; t += 400) {
    const v = await fn();
    if (v) return v;
    await sleep(400);
  }
  return null;
};

let browser = null;
const errors = [];
try {
  // ============================================================ Part A: HTTP
  await db.from("marketing_campaigns").insert({ platform: "meta", channel: "meta", name: CAMPAIGN, status: "active", start_date: new Date().toISOString().slice(0, 10) });
  await db.from("ghl_settings").update({ stage_ids: { new: "stg-new", quoted: "stg-quo", won: "stg-won" }, opportunity_sync_mode: "dry_run", business_name: "Keystone Clean" }).eq("id", true);
  await db.from("message_templates").update({ mode: "dry_run" }).neq("key", "x");

  // -- the door: secret, shape, window, location
  const c1 = contact("e2e-ghl-c1", "(332) 555-0190", { tags: ["sms-consent"] });
  ghl.contacts.set(c1.id, c1);
  ghl.opps.set("e2e-ghl-o1", { id: "e2e-ghl-o1", contactId: c1.id, pipelineStageId: "stg-new", status: "open" });
  check("no secret: 401", (await post(event("contact", { contactId: c1.id }), {})).status === 401);
  check("wrong secret: 401", (await post(event("contact", { contactId: c1.id }), { "x-ghl-webhook-secret": "0".repeat(64) })).status === 401);
  check("bad JSON: 400", (await post(null, undefined, "{nope")).status === 400);
  const noId = await post(event("contact", {}));
  check("missing contact id: 400 with issues", noId.status === 400 && "issues" in (await noId.json()));
  check("stale timestamp: 400", (await post(event("contact", { contactId: c1.id }, { sentAt: Date.now() - 6 * 60_000 }))).status === 400);
  check("wrong location: 400", (await post(event("contact", { contactId: c1.id }, { locationId: "other" }))).status === 400);
  check("nothing was created by the rejected calls", (await leadOf(c1.id)).c === null);

  // -- a new lead: only the id is in the webhook, everything else comes from the fetched contact
  const ev1 = event("contact", { contactId: c1.id });
  const r1 = await post(ev1);
  const j1 = await r1.json();
  check("contact event: 200, lead created", r1.status === 200 && j1.handled === "lead created", JSON.stringify(j1));
  const { c, l } = await leadOf(c1.id);
  check("phone normalized, consent from the tag", c?.phone === "+13325550190" && c?.sms_consent === true, JSON.stringify(c));
  check("lead has the GHL opportunity as external id", l?.ghl_opportunity_id === "e2e-ghl-o1" && l?.external_id === "e2e-ghl-o1");
  check("channel and campaign from the UTM, creative from utm_content", l?.channel === "meta" && l?.creative === "E2E Reel" && l?.campaign_id !== null, JSON.stringify({ ch: l?.channel, cr: l?.creative }));
  const { count: calls } = await db.from("activities").select("id", { count: "exact", head: true }).eq("lead_id", l.id).eq("type", "call");
  check("a call-now task for the owner exists and the follow-up is today", calls === 1 && l?.next_follow_up_on !== null);
  const dup = await post(ev1);
  check("same event id again: duplicate:true", dup.status === 200 && (await dup.json()).duplicate === true);
  await post(event("contact", { contactId: c1.id }));
  const { count: leadCount } = await db.from("leads").select("id", { count: "exact", head: true }).eq("contact_id", c.id);
  check("a second event for the same person makes no second lead", leadCount === 1, leadCount);
  const instant = await waitFor(async () => (await db.from("message_log").select("outcome, reason").eq("dedupe_key", `instant_reply:${l.id}`).maybeSingle()).data, quiet() ? 3000 : 12000);
  check(quiet() ? "quiet hours: the instant reply waits (no log row, nothing sent)" : "dry-run: the instant reply is logged, not sent", quiet() ? instant === null && ghl.sms.length === 0 : instant?.outcome === "dry_run" && ghl.sms.length === 0, JSON.stringify(instant));

  // -- messages
  ghl.messages.set("e2e-ghl-m1", { id: "e2e-ghl-m1", contactId: c1.id, body: "Can you come Friday?", direction: "inbound", messageType: "TYPE_SMS", dateAdded: new Date().toISOString() });
  const evm = event("message", { messageId: "e2e-ghl-m1" });
  check("inbound text logged", (await post(evm)).status === 200 && (await db.from("activities").select("id").eq("external_id", "e2e-ghl-m1").eq("direction", "inbound")).data?.length === 1);
  await post(event("message", { messageId: "e2e-ghl-m1" }));
  check("the same text delivered again is not logged twice", (await db.from("activities").select("id").eq("external_id", "e2e-ghl-m1")).data?.length === 1);
  ghl.messages.set("e2e-ghl-m2", { id: "e2e-ghl-m2", contactId: c1.id, body: "Hi, it's Maria, calling now", direction: "outbound", messageType: "TYPE_SMS", source: "app", dateAdded: new Date().toISOString() });
  await post(event("message", { messageId: "e2e-ghl-m2" }));
  check("a human reply sets the first-response time", (await leadOf(c1.id)).l?.first_response_at !== null);
  ghl.messages.set("e2e-ghl-m3", { id: "e2e-ghl-m3", contactId: c1.id, body: "STOP", direction: "inbound", messageType: "TYPE_SMS", dateAdded: new Date().toISOString() });
  await post(event("message", { messageId: "e2e-ghl-m3" }));
  const optOut = (await db.from("opt_outs").select("source").eq("value", "+13325550190").maybeSingle()).data;
  check("STOP opts the number out and clears consent", optOut?.source === "stop_keyword" && (await leadOf(c1.id)).c?.sms_consent === false);

  // -- stage changes in GHL: applied, and not echoed back
  ghl.opps.set("e2e-ghl-o1", { id: "e2e-ghl-o1", contactId: c1.id, pipelineStageId: "stg-quo", status: "open" });
  await post(event("opportunity", { opportunityId: "e2e-ghl-o1" }));
  check("GHL stage change moves the lead to Quote sent", (await leadOf(c1.id)).l?.stage === "quoted");
  const echo = (await db.from("sync_queue").select("id").eq("provider", "ghl").eq("entity_id", l.id)).data;
  check("a change that came from GHL is not sent back", (echo ?? []).length === 0);

  // -- stage changes in the app: queued, dry-run first, then live with backoff
  await db.from("leads").update({ stage: "won", closed_at: new Date().toISOString() }).eq("id", l.id);
  const queued = (await db.from("sync_queue").select("id, status, operation").eq("provider", "ghl").eq("entity_id", l.id)).data ?? [];
  check("an app stage change queues one update", queued.length === 1 && queued[0].operation === "update_opportunity" && queued[0].status === "pending");
  await db.from("leads").update({ stage: "quoted", closed_at: null }).eq("id", l.id);
  check("a second change before it ran still leaves one", ((await db.from("sync_queue").select("id").eq("provider", "ghl").eq("entity_id", l.id).eq("status", "pending")).data ?? []).length === 1);
  const dry = await cron(false);
  const qrow = (await db.from("sync_queue").select("status, last_error").eq("id", queued[0].id).single()).data;
  check("dry-run: the cron notes the change and calls GHL for nothing", dry.status === 200 && qrow.status === "succeeded" && /^dry run/.test(qrow.last_error ?? "") && ghl.puts.length === 0, JSON.stringify(qrow));
  await db.from("ghl_settings").update({ opportunity_sync_mode: "live" }).eq("id", true);
  await db.from("leads").update({ stage: "won", closed_at: new Date().toISOString() }).eq("id", l.id);
  ghl.failPut = true;
  await cron(false);
  const failedRow = (await db.from("sync_queue").select("id, status, attempts, last_error, next_attempt_at").eq("provider", "ghl").eq("entity_id", l.id).eq("status", "pending").single()).data;
  check("a GHL error is retried later with a delay", failedRow?.attempts === 1 && /503/.test(failedRow.last_error ?? "") && new Date(failedRow.next_attempt_at) > new Date(Date.now() + 15_000), JSON.stringify(failedRow));
  ghl.failPut = false;
  await db.from("sync_queue").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", failedRow.id);
  await cron(false);
  check("live: the retry moves the GHL opportunity to the won stage", ghl.puts.length === 1 && ghl.puts[0].body.pipelineStageId === "stg-won" && ghl.puts[0].body.status === "won", JSON.stringify(ghl.puts));
  await db.from("ghl_settings").update({ opportunity_sync_mode: "dry_run" }).eq("id", true);

  // -- texts that go out: consent, opt-out, live, retry
  await db.from("message_templates").update({ mode: "live" }).eq("key", "instant_reply");
  const c2 = contact("e2e-ghl-c2", "(332) 555-0191", { tags: ["sms-consent"] });
  const c3 = contact("e2e-ghl-c3", "(332) 555-0192");
  ghl.contacts.set(c2.id, c2);
  ghl.contacts.set(c3.id, c3);
  await post(event("contact", { contactId: c2.id }));
  await post(event("contact", { contactId: c3.id }));
  const l2 = (await leadOf(c2.id)).l;
  const l3 = (await leadOf(c3.id)).l;
  if (quiet()) {
    await sleep(3000);
    check("quiet hours: no text goes out, even live with consent", ghl.sms.length === 0);
  } else {
    const sent2 = await waitFor(async () => (await db.from("message_log").select("outcome, body").eq("dedupe_key", `instant_reply:${l2.id}`).maybeSingle()).data?.outcome === "sent");
    check("live with consent: the instant reply goes to the GHL contact", sent2 && ghl.sms.some((s) => s.contactId === c2.id && /Keystone Clean/.test(s.message) && /STOP/.test(s.message)), JSON.stringify(ghl.sms));
    const blocked3 = await waitFor(async () => (await db.from("message_log").select("outcome, reason").eq("dedupe_key", `instant_reply:${l3.id}`).maybeSingle()).data);
    check("no consent: blocked with the reason, nothing sent", blocked3?.outcome === "blocked" && /consent/.test(blocked3.reason ?? "") && !ghl.sms.some((s) => s.contactId === c3.id), JSON.stringify(blocked3));
    check("the opted-out person is never texted", !ghl.sms.some((s) => s.contactId === c1.id));
    const smsBefore = ghl.sms.length;
    await cron();
    check("running it again sends nothing twice", ghl.sms.length === smsBefore);
    // retry path
    ghl.failSms = true;
    const c4 = contact("e2e-ghl-c4", "(332) 555-0193", { tags: ["sms-consent"] });
    ghl.contacts.set(c4.id, c4);
    await post(event("contact", { contactId: c4.id }));
    const l4 = (await leadOf(c4.id)).l;
    const pending4 = await waitFor(async () => (await db.from("sync_queue").select("id").eq("provider", "ghl").eq("operation", "send_sms").eq("status", "pending")).data?.[0]);
    check("a text GHL rejects stays pending and is queued for retry", Boolean(pending4) && (await db.from("message_log").select("outcome").eq("dedupe_key", `instant_reply:${l4.id}`).single()).data?.outcome === "pending");
    ghl.failSms = false;
    if (pending4) await db.from("sync_queue").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", pending4.id);
    await cron(false);
    check("the retry sends it once", ghl.sms.filter((s) => s.contactId === c4.id).length === 1 && (await db.from("message_log").select("outcome").eq("dedupe_key", `instant_reply:${l4.id}`).single()).data?.outcome === "sent");
  }
  await db.from("message_templates").update({ mode: "dry_run" }).eq("key", "instant_reply");

  // -- webhook trouble: GHL down is a 500 and a failed event that a retry completes
  const c6 = contact("e2e-ghl-c6", "(332) 555-0194");
  ghl.contacts.set(c6.id, c6);
  ghl.failContact = true;
  const evDown = event("contact", { contactId: c6.id });
  check("GHL down: 500 so GHL retries", (await post(evDown)).status === 500);
  check("the failed event is recorded", (await db.from("webhook_events").select("status").eq("provider", "ghl").eq("event_id", evDown.eventId).single()).data?.status === "failed");
  ghl.failContact = false;
  const retried = await post(evDown);
  check("the same event id succeeds on retry", retried.status === 200 && (await retried.json()).handled === "lead created");

  // -- the reconciliation recovers a lead whose webhook never arrived, and is idempotent
  const c5 = contact("e2e-ghl-c5", "(332) 555-0194".replace("94", "95"));
  ghl.contacts.set(c5.id, c5);
  const rec1 = await cron();
  check("the reconciliation recovers the missed contact", rec1.status === 200 && (await leadOf(c5.id)).l !== null, JSON.stringify(rec1.body.reconcile));
  await cron();
  const { count: c5Leads } = await db.from("leads").select("id", { count: "exact", head: true }).eq("contact_id", (await leadOf(c5.id)).c.id);
  check("running it again makes no duplicate", c5Leads === 1, c5Leads);
  const rec = (await db.from("ghl_settings").select("last_reconcile_at, last_reconcile_note").single()).data;
  check("the run is recorded for the status page", rec.last_reconcile_at !== null && /contacts/.test(rec.last_reconcile_note ?? ""));
  check("the cron refuses without its secret", (await fetch(`${base}/api/cron/ghl-sync`)).status === 401);

  // ============================================================ Part B: the pages
  await db.from("message_templates").update({ mode: "dry_run" }).neq("key", "x");
  const password = randomBytes(18).toString("base64url");
  const make = async (role) => {
    const email = `seed+e2eghl-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true });
    return { id: data.user.id, email };
  };
  const admin = await make("admin");
  const staff = await make("staff");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const signIn = async (ctx, who, landing) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", who.email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL(landing, { timeout: 25000 });
    return page;
  };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  // a failed sync to look at and retry
  const { data: dead } = await db.from("sync_queue").insert({ provider: "ghl", direction: "outbound", entity_type: "lead", entity_id: l.id, operation: "update_opportunity", status: "dead", attempts: 8, last_error: "GHL answered 503" }).select("id").single();

  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ap = await signIn(actx, admin, /command-center/);
  const card = ap.getByTestId("ghl-failed-card");
  await card.waitFor({ timeout: 15000 });
  check("Command Center shows the failed-sync card with the count", /1 failed/.test(await card.innerText()), await card.innerText());
  await ap.goto(`${base}/settings`, { waitUntil: "networkidle" });
  check("Settings links to Integrations for the admin", (await ap.locator('a[href="/settings/integrations"]').count()) >= 1);
  await ap.goto(`${base}/settings/integrations`, { waitUntil: "networkidle" });
  check("the page shows connection, failed syncs, texts, pipeline and the log", (await ap.getByTestId("ghl-connection").count()) === 1 && (await ap.getByTestId("ghl-failed").count()) === 1 && (await ap.getByTestId("ghl-templates").count()) === 1 && (await ap.getByTestId("ghl-settings").count()) === 1 && (await ap.getByTestId("ghl-message-log").count()) === 1);
  const conn = await ap.getByTestId("ghl-connection").innerText();
  check("the keys are shown as set, never their values", /API token/.test(conn) && /Set/.test(conn) && !conn.includes("fake-ghl-token") && !conn.includes(SECRET));
  check("last webhook and last reconciliation are shown", !/Never/.test(await ap.getByTestId("last-webhook").innerText()) && !/Never/.test(await ap.getByTestId("last-reconcile").innerText()));
  check("the failed sync is listed with its error", /GHL answered 503/.test(await ap.getByTestId("ghl-failed").innerText()));
  const tpl = await ap.getByTestId("ghl-templates").innerText();
  check("every text starts as a dry run", (await ap.getByTestId("ghl-templates").getByText("Dry run", { exact: true }).count()) >= 5 && (await ap.getByTestId("ghl-templates").locator('[aria-checked="true"]').filter({ hasText: "Live" }).count()) === 0, tpl.slice(0, 80));
  await ap.getByRole("button", { name: "Retry" }).first().click();
  await ap.getByText("Queued to try again").first().waitFor({ timeout: 10000 });
  check("Retry puts the failed sync back in the queue", (await db.from("sync_queue").select("status").eq("id", dead.id).single()).data?.status === "pending");

  // dry run -> live needs a second press
  const t = ap.getByTestId("template-review_request");
  await t.getByRole("radio", { name: "Live" }).click();
  await ap.getByTestId("save-template-review_request").click();
  check("going live asks for a second confirmation first", (await db.from("message_templates").select("mode").eq("key", "review_request").single()).data?.mode === "dry_run" && /Press again to confirm/.test(await t.innerText()));
  await ap.getByTestId("save-template-review_request").click();
  await ap.getByText("Live: real texts will go out").first().waitFor({ timeout: 10000 });
  check("confirming switches only that text to live", (await db.from("message_templates").select("key, mode").eq("mode", "live")).data?.map((x) => x.key).join() === "review_request");
  await t.getByRole("radio", { name: "Dry run" }).click();
  await ap.getByTestId("save-template-review_request").click();
  await ap.getByText("Saved (dry run)").first().waitFor({ timeout: 10000 });
  await t.locator("textarea").fill("No opt out line here");
  await t.getByRole("radio", { name: "Live" }).click();
  await ap.getByTestId("save-template-review_request").click();
  check("a live text without the STOP line is refused inline", (await t.getByText("A live message must tell people they can reply STOP").count()) >= 1);
  await ap.reload({ waitUntil: "networkidle" });
  await ap.fill("#ghl-per-contact", "0");
  await ap.getByTestId("save-ghl-settings").click();
  check("a 0 daily limit is refused inline", (await ap.getByText("At least 1").count()) >= 1);
  await ap.fill("#ghl-per-contact", "3");
  await ap.fill("#ghl-stage-lost", "stg-lost");
  await ap.getByTestId("save-ghl-settings").click();
  await ap.getByText("GHL settings saved").first().waitFor({ timeout: 10000 });
  check("the pipeline mapping saves", (await db.from("ghl_settings").select("stage_ids").single()).data?.stage_ids?.lost === "stg-lost");

  // staff
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await signIn(sctx, staff, /command-center|leads|schedule/);
  await sp.goto(`${base}/settings/integrations`, { waitUntil: "networkidle" });
  check("staff are sent back from Integrations", !/integrations/.test(sp.url()));
  await sp.goto(`${base}/command-center`, { waitUntil: "networkidle" });
  check("staff see no sync card", (await sp.getByTestId("ghl-failed-card").count()) === 0);
  await sctx.close();

  // directions x themes, desktop and phone
  const prefs = [];
  for (const direction of ["titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });
  for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
    for (const p of prefs) {
      await db.from("user_preferences").upsert({ user_id: admin.id, direction: p.direction, theme: p.theme });
      const page = ctx.pages()[0] ?? (await signIn(ctx, admin, /command-center/));
      for (const path of ["/settings/integrations", "/command-center"]) {
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        const attrs = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
        const bad = (await overflow(page)) ? "overflow" : attrs.d !== p.direction || attrs.dark !== (p.theme === "dark") ? `wrong theme ${JSON.stringify(attrs)}` : (await page.locator("h1").count()) < 1 ? "no heading" : "";
        check(`${path} ${label} ${p.direction} ${p.theme}`, bad === "", bad);
      }
    }
    await ctx.close();
  }
  await actx.close();
} finally {
  await browser?.close();
  server.kill();
  fake.close();
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(failed, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
