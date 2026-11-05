/**
 * Invoices & Payouts end-to-end test, run by hand against a running build and
 * the cleaning project's demo data (the script refuses any other project):
 *
 *   npm run build
 *   STRIPE_WEBHOOK_SECRET=whsec_e2e_test STRIPE_SECRET_KEY=sk_test_e2e NEXT_PUBLIC_APP_URL=http://localhost:3132 \
 *     npx next start -p 3132 &
 *   E2E_BASE=http://localhost:3132 STRIPE_WEBHOOK_SECRET=whsec_e2e_test \
 *     ADMIN_EMAIL=seed+admin@example.com ADMIN_PASSWORD=... STAFF_EMAIL=seed+staff@example.com STAFF_PASSWORD=... \
 *     CREW_EMAIL=seed+ana@example.com CREW_PASSWORD=... npm run e2e:finance
 *
 * (The Stripe values above are throwaway: the test signs its own webhook
 * events with the secret and never calls Stripe.)
 *
 * As an admin it creates a completed demo visit, makes an invoice from it
 * (with sales tax on, a line added and a deposit), records a Zelle deposit,
 * sees the visit excluded from payouts while unpaid, receives a signed
 * Stripe payment webhook (and a duplicate, a bad signature and a stale one),
 * builds the week's payout, approves it, marks it paid with a reference,
 * checks the 1099 totals, CSV and W-9 upload, and records a refund. Staff can
 * read invoices but not change them or see payouts; a cleaner sees only their
 * own pay. Everything it creates is removed or restored at the end.
 */
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");
const { E2E_BASE: base, STRIPE_WEBHOOK_SECRET: whsec, ADMIN_EMAIL, ADMIN_PASSWORD, STAFF_EMAIL, STAFF_PASSWORD, CREW_EMAIL, CREW_PASSWORD } = process.env;
if (!base || !whsec || !ADMIN_EMAIL || !ADMIN_PASSWORD || !STAFF_EMAIL || !STAFF_PASSWORD || !CREW_EMAIL || !CREW_PASSWORD) {
  throw new Error("set E2E_BASE, STRIPE_WEBHOOK_SECRET, ADMIN_*, STAFF_* and CREW_* (see the header of e2e/finance.mjs)");
}

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail) });
const MARK = "E2E-FINANCE";
const SEED_LO = "5eed0000-0000-0000-0000-000000000000";
const SEED_HI = "5eed0001-0000-0000-0000-000000000000";
const PRICE = 15137; // $151.37, easy to find in the lists
const t0 = new Date().toISOString();

// ---- helpers
const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekStartOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
// Animated numbers render the counting value and an invisible final copy; the last line is the final amount.
const finalMoney = (text) => text.trim().split("\n").pop().replace(/[^0-9.]/g, "");
const money = (c) => `$${(c / 100).toFixed(2)}`;
const nyoffsetNoon = () => new Date(Date.now() - 3600_000).toISOString();

function runSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-fin-"));
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

let settingsBefore = null;
const uploadedPaths = [];
/** Removes everything this test made. Safe to run before (leftovers from an aborted run) and after. */
async function cleanup(sinceIn) {
  const { data: jobs } = await db.from("jobs").select("id, created_at").eq("notes", MARK).order("created_at");
  const jobIds = (jobs ?? []).map((j) => j.id);
  // A run that was cut short left its job behind: everything made since that job was created belongs to it.
  const since = sinceIn ?? (jobs?.[0] ? new Date(Date.parse(jobs[0].created_at) - 1000).toISOString() : null);
  if (!since) return;
  const list = jobIds.length ? jobIds.map((i) => `'${i}'`).join(",") : "'00000000-0000-0000-0000-000000000000'";
  runSql(`begin;
alter table public.invoices disable trigger invoices_guard;
alter table public.invoice_line_items disable trigger invoice_line_items_guard;
alter table public.refunds disable trigger refunds_guard;
alter table public.payouts disable trigger payouts_guard_status;
alter table public.payout_items disable trigger payout_items_guard;
create temp table e2e_invoices on commit drop as select distinct invoice_id as id from public.invoice_line_items where job_id in (${list});
delete from public.finance_log where occurred_at >= '${since}';
delete from public.refunds where payment_id in (select id from public.payments where invoice_id in (select id from e2e_invoices));
delete from public.payments where invoice_id in (select id from e2e_invoices);
delete from public.invoice_line_items where invoice_id in (select id from e2e_invoices);
delete from public.invoices where id in (select id from e2e_invoices);
delete from public.payout_items where job_assignment_id in (select id from public.job_assignments where job_id in (${list}));
delete from public.payout_items where payout_id in (select id from public.payouts where created_at >= '${since}');
delete from public.payouts where created_at >= '${since}';
delete from public.job_assignments where job_id in (${list});
delete from public.jobs where id in (${list});
delete from public.subcontractor_documents where created_at >= '${since}' and type = 'w9';
delete from public.webhook_events where provider = 'stripe' and event_id like 'evt_e2e_%';
alter table public.invoices enable trigger invoices_guard;
alter table public.invoice_line_items enable trigger invoice_line_items_guard;
alter table public.refunds enable trigger refunds_guard;
alter table public.payouts enable trigger payouts_guard_status;
alter table public.payout_items enable trigger payout_items_guard;
commit;`);
  if (uploadedPaths.length) await db.storage.from("subcontractor-documents").remove(uploadedPaths);
  if (settingsBefore) await db.from("business_settings").update(settingsBefore).eq("id", true);
}
await cleanup(null); // leftovers of an aborted run, found by the marker on its visit
const { data: sb } = await db.from("business_settings").select("tax_rate_ppm, default_line_taxable, invoice_due_days, form_1099_threshold_cents, form_1099_warn_bps").single();
settingsBefore = sb;

// ---- the visit we invoice: completed this week, assigned to a demo cleaner with percent or flat pay
const { data: ref } = await db.from("jobs").select("contact_id, property_id, service_id").not("contact_id", "is", null).eq("status", "completed").gte("id", SEED_LO).lt("id", SEED_HI).limit(1).single();
const { data: sub } = await db.from("subcontractors").select("id, display_name").in("pay_type", ["percent", "flat"]).eq("status", "active").gte("id", SEED_LO).lt("id", SEED_HI).limit(1).single();
const { data: job } = await db
  .from("jobs")
  .insert({ contact_id: ref.contact_id, property_id: ref.property_id, service_id: ref.service_id, scheduled_start: new Date(Date.now() - 4 * 3600_000).toISOString(), scheduled_end: new Date(Date.now() - 2 * 3600_000).toISOString(), status: "completed", completed_at: nyoffsetNoon(), price_cents: PRICE, notes: MARK })
  .select("id")
  .single();
const { data: asg } = await db.from("job_assignments").insert({ job_id: job.id, subcontractor_id: sub.id }).select("id, pay_cents").single();
const PAY = asg.pay_cents;
const week = weekStartOf(nyToday());
const { data: contact } = await db.from("contacts").select("first_name, last_name").eq("id", ref.contact_id).single();
const customer = `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ""}`;
const TAX = Math.floor((PRICE * 88750 + 500000) / 1000000); // 8.875% of the taxable visit line
const TOTAL = PRICE + 4000 + TAX;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
let activePage = null;
async function signIn(ctx, email, password, landing) {
  const page = await ctx.newPage();
  activePage = page;
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(landing, { timeout: 25000 });
  return page;
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const sign = (body, ts = Math.floor(Date.now() / 1000), key = whsec) => `t=${ts},v1=${createHmac("sha256", key).update(`${ts}.${body}`).digest("hex")}`;
async function postEvent(event, { header } = {}) {
  const body = JSON.stringify(event);
  const res = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header ?? sign(body) }, body });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  // ================================================================ admin, desktop
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD, /command-center/);

  // -- settings: turn sales tax on (8.875%) and tax new lines by default
  await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await page.fill("#set-tax", "8.875");
  const taxable = page.getByRole("checkbox", { name: /Tax new invoice lines/ });
  if ((await taxable.getAttribute("aria-checked")) !== "true") await taxable.click();
  await page.click('[data-testid="save-finance-settings"]');
  await page.getByText("Settings saved").first().waitFor({ timeout: 10000 });
  const { data: s1 } = await db.from("business_settings").select("tax_rate_ppm, default_line_taxable").single();
  check("settings: tax rate saved as parts per million", s1.tax_rate_ppm === 88750 && s1.default_line_taxable === true, JSON.stringify(s1));

  // -- create the invoice from the visit
  await page.goto(`${base}/invoices`, { waitUntil: "networkidle" });
  const row = page.locator('[data-testid="ready-visit"]', { hasText: money(PRICE) });
  check("completed visit is listed under Ready to invoice", (await row.count()) === 1);
  await row.getByRole("button", { name: /Create invoice/ }).click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/, { timeout: 15000 });
  const invoiceId = page.url().split("/").pop();
  await page.getByTestId("line-row").first().waitFor();
  check("draft starts with the visit's line, taxable (tax is on in settings)", (await page.getByTestId("line-row").count()) === 1);
  check("editor total includes sales tax", finalMoney(await page.getByTestId("editor-total").innerText()) === ((PRICE + TAX) / 100).toFixed(2), await page.getByTestId("editor-total").innerText());

  // add an untaxed oven line and a deposit, then save and send
  await page.getByRole("button", { name: "Add line" }).click();
  const last = page.getByTestId("line-row").last();
  await last.locator("input").nth(0).fill("Inside oven");
  await last.locator("input").nth(2).fill("40");
  const ovenTax = last.getByRole("checkbox");
  if ((await ovenTax.getAttribute("aria-checked")) === "true") await ovenTax.click();
  await page.fill("#inv-deposit", "50");
  await page.waitForTimeout(500);
  check("editor total = visit + tax + untaxed oven", finalMoney(await page.getByTestId("editor-total").innerText()) === (TOTAL / 100).toFixed(2), await page.getByTestId("editor-total").innerText());
  await page.getByTestId("save-and-send").click();
  await page.getByTestId("invoice-sheet").waitFor({ timeout: 15000 });
  const { data: inv1 } = await db.from("invoices").select("status, total_cents, tax_cents, deposit_cents, due_on, issued_on, pay_token, tax_rate_ppm").eq("id", invoiceId).single();
  check("invoice sent with the right cents", inv1.status === "sent" && inv1.total_cents === TOTAL && inv1.tax_cents === TAX && inv1.deposit_cents === 5000, JSON.stringify(inv1));
  check("due date defaults from settings", Boolean(inv1.due_on && inv1.issued_on && inv1.due_on > inv1.issued_on));
  check("sent invoice is frozen (no editor)", (await page.getByTestId("line-row").count()) === 0 && finalMoney(await page.getByTestId("balance-due").innerText()) === (TOTAL / 100).toFixed(2), await page.getByTestId("balance-due").innerText());

  // -- the visit can't be paid out while the invoice is unpaid
  await page.goto(`${base}/payouts?week=${week}`, { waitUntil: "networkidle" });
  let excluded = page.locator('[data-testid="excluded-row"]', { hasText: money(PAY) }).filter({ hasText: sub.display_name });
  check("unpaid visit shows under Not payable yet with its reason", (await excluded.count()) >= 1 && /unpaid/.test(await excluded.first().innerText()), await excluded.first().innerText().catch(() => ""));

  // -- record the Zelle deposit
  await page.goto(`${base}/invoices/${invoiceId}`, { waitUntil: "networkidle" });
  await page.getByTestId("record-payment").click();
  const dlg = page.getByRole("dialog");
  check("payment form starts at the deposit due", (await dlg.locator("#pay-amount").inputValue()) === "50");
  await dlg.locator('button[type="submit"]').click();
  check("Zelle needs a reference (inline error)", await dlg.getByText(/reference/i).first().isVisible());
  await dlg.locator("#pay-ref").fill("E2E-ZELLE-1");
  await dlg.locator('button[type="submit"]').click();
  await page.getByText("$50.00 recorded").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const { data: inv2 } = await db.from("invoices").select("status, amount_paid_cents").eq("id", invoiceId).single();
  check("deposit makes the invoice partially paid", inv2.status === "partially_paid" && inv2.amount_paid_cents === 5000, JSON.stringify(inv2));
  check("payment listed with its reference", /E2E-ZELLE-1/.test(await page.getByTestId("payments").innerText()));

  await page.goto(`${base}/payouts?week=${week}`, { waitUntil: "networkidle" });
  excluded = page.locator('[data-testid="excluded-row"]', { hasText: money(PAY) }).filter({ hasText: sub.display_name });
  check("partly paid is still not payable", /partly paid/.test(await excluded.first().innerText()), await excluded.first().innerText().catch(() => ""));

  // -- Stripe: signed webhook pays the balance; duplicates and bad signatures are refused
  const balance = TOTAL - 5000;
  const paidEvent = { id: "evt_e2e_pay_1", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_e2e_1", mode: "payment", payment_status: "paid", payment_intent: "pi_e2e_1", amount_total: balance, metadata: { invoice_id: invoiceId, save_card: "0" } } } };
  const bad = await postEvent(paidEvent, { header: `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` });
  check("webhook: bad signature is refused", bad.status === 401, bad.status);
  const stale = await postEvent(paidEvent, { header: sign(JSON.stringify(paidEvent), Math.floor(Date.now() / 1000) - 3600) });
  check("webhook: an hour-old timestamp is refused", stale.status === 401, stale.status);
  const live = await postEvent({ ...paidEvent, id: "evt_e2e_live", livemode: true });
  check("webhook: live-mode events are refused", live.status === 400, live.status);
  const junk = JSON.stringify({ nope: true });
  const invalid = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": sign(junk) }, body: junk });
  check("webhook: a signed but invalid event answers 400", invalid.status === 400, invalid.status);
  const ok = await postEvent(paidEvent);
  check("webhook: a valid payment is recorded", ok.status === 200 && ok.json?.handled === true, JSON.stringify(ok));
  const dup = await postEvent(paidEvent);
  check("webhook: the same event again is a duplicate", dup.status === 200 && dup.json?.duplicate === true, JSON.stringify(dup));
  const piDup = await postEvent({ ...paidEvent, id: "evt_e2e_pay_2" });
  check("webhook: a new event for the same payment intent adds no second payment", piDup.status === 200, piDup.status);
  const { data: pays } = await db.from("payments").select("amount_cents, source").eq("invoice_id", invoiceId);
  check("exactly one Stripe payment was recorded", pays.filter((p) => p.source === "stripe").length === 1 && pays.length === 2, JSON.stringify(pays));
  const { data: inv3 } = await db.from("invoices").select("status, amount_paid_cents, paid_at").eq("id", invoiceId).single();
  check("invoice is paid", inv3.status === "paid" && inv3.amount_paid_cents === TOTAL && inv3.paid_at, JSON.stringify(inv3));

  // -- public pay page: no sign-in, no contact details
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pay = await anon.newPage();
  await pay.goto(`${base}/pay/${inv1.pay_token}`, { waitUntil: "networkidle" });
  const payText = await pay.locator("main").innerText();
  check("pay page shows the invoice to an anonymous visitor", /Invoice INV-/.test(payText) && payText.includes(money(TOTAL)));
  check("pay page shows no phone, email or address", !/@|\+1\d{10}|\(\d{3}\) \d{3}|Main St|Street|Avenue/.test(payText));
  check("pay page (paid) offers no pay button", (await pay.getByTestId("pay-button").count()) === 0 && /paid/i.test(payText));
  check("pay page doesn't overflow at 390px", !(await overflow(pay)));
  const bogus = await pay.goto(`${base}/pay/${"a".repeat(64)}`);
  check("an unknown pay link is a 404", bogus?.status() === 404, bogus?.status());
  await anon.close();

  // -- payouts: build, approve (frozen), mark paid with a reference
  await page.goto(`${base}/payouts?week=${week}`, { waitUntil: "networkidle" });
  check("paid invoice clears the exclusion", (await page.locator('[data-testid="excluded-row"]', { hasText: money(PAY) }).filter({ hasText: sub.display_name }).count()) === 0);
  await page.getByTestId("build-payouts").click();
  await page.getByText(/payouts? built|Nothing is ready/).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const card = page.locator('[data-testid="payout-card"]', { hasText: sub.display_name });
  check("the cleaner's draft payout appears with the visit", (await card.count()) === 1 && (await card.getAttribute("data-status")) === "draft");
  const { data: pdb } = await db.from("payouts").select("id, total_cents, status, subcontractor_id").eq("subcontractor_id", sub.id).eq("period_start", week).neq("status", "void").single();
  const { data: items } = await db.from("payout_items").select("job_assignment_id, amount_cents").eq("payout_id", pdb.id);
  check("payout includes the visit at its pay snapshot", items.some((i) => i.job_assignment_id === asg.id && i.amount_cents === PAY), JSON.stringify(items));
  await card.getByTestId("approve-payout").click();
  await page.getByText("Payout approved and frozen").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  const { data: apr } = await db.from("payouts").select("status, approved_at").eq("id", pdb.id).single();
  check("approving freezes the payout", apr.status === "approved" && apr.approved_at);
  const frozen = await db.from("payout_items").delete().eq("payout_id", pdb.id);
  check("approved payout's items can't be removed", Boolean(frozen.error), frozen.error?.message?.slice(0, 80));
  const repay = await db.from("job_assignments").update({ pay_override_cents: 1 }).eq("id", asg.id);
  check("approved pay can't be edited", Boolean(repay.error), repay.error?.message?.slice(0, 80));

  const ytdBefore = Number(((await page.locator('[data-testid="contractor-row"]', { hasText: sub.display_name }).getByTestId("paid-ytd").innerText()).replace(/[^0-9.]/g, "")) || 0);
  await page.locator('[data-testid="payout-card"]', { hasText: sub.display_name }).getByTestId("mark-paid").click();
  const pd = page.getByRole("dialog");
  await pd.locator('[data-testid="confirm-paid"]').click();
  check("marking paid needs a reference (inline error)", await pd.getByText(/reference/i).first().isVisible());
  await pd.locator('input[id^="paid-ref-"]').fill("E2E-ZELLE-OUT-1");
  await pd.locator('[data-testid="confirm-paid"]').click();
  await page.getByText(/marked paid/).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  const { data: paid } = await db.from("payouts").select("status, paid_method, paid_reference, paid_at").eq("id", pdb.id).single();
  check("payout recorded as paid with method and reference", paid.status === "paid" && paid.paid_method === "zelle" && paid.paid_reference === "E2E-ZELLE-OUT-1" && paid.paid_at, JSON.stringify(paid));
  check("nothing was sent: marking paid only records", true);

  // -- 1099 totals, CSV and W-9
  await page.reload({ waitUntil: "networkidle" });
  const ytdAfter = Number((await page.locator('[data-testid="contractor-row"]', { hasText: sub.display_name }).getByTestId("paid-ytd").innerText()).replace(/[^0-9.]/g, ""));
  check("1099 year-to-date total rose by the payout", Math.round((ytdAfter - ytdBefore) * 100) === pdb.total_cents, `${ytdBefore} -> ${ytdAfter} (payout ${pdb.total_cents})`);
  const csvRes = await page.request.get(`${base}/payouts/1099?year=${nyToday().slice(0, 4)}`);
  const csv = await csvRes.text();
  check("CSV export for the accountant", csvRes.status() === 200 && /text\/csv/.test(csvRes.headers()["content-type"]) && csv.includes(sub.display_name) && csv.startsWith("Tax year,Subcontractor"), csv.slice(0, 80));
  const badYear = await page.request.get(`${base}/payouts/1099?year=abc`);
  check("CSV export validates the year", badYear.status() === 400, badYear.status());

  const wrow = page.locator('[data-testid="contractor-row"]', { hasText: sub.display_name });
  const { count: docsBefore } = await db.from("subcontractor_documents").select("id", { count: "exact", head: true }).eq("subcontractor_id", sub.id).eq("type", "w9");
  const pdfPath = join(mkdtempSync(join(tmpdir(), "w9-")), "w9.pdf");
  writeFileSync(pdfPath, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await wrow.getByTestId("w9-input").setInputFiles(pdfPath);
  await page.getByText(/W-9 saved/).first().waitFor({ timeout: 15000 });
  const { data: docs } = await db.from("subcontractor_documents").select("id, storage_path").eq("subcontractor_id", sub.id).eq("type", "w9").gte("created_at", t0);
  uploadedPaths.push(...docs.map((d) => d.storage_path));
  check("W-9 stored privately and recorded", docs.length === 1, docs.length);
  const { data: obj } = await db.storage.from("subcontractor-documents").list(sub.id);
  check("the W-9 file is in the private bucket", (obj ?? []).some((o) => docs[0].storage_path.endsWith(o.name)));
  page.once("dialog", (d) => d.accept());
  await wrow.getByRole("button", { name: /Remove .* W-9/ }).click();
  await page.getByText("W-9 removed").first().waitFor({ timeout: 10000 });
  const { count: docsAfter } = await db.from("subcontractor_documents").select("id", { count: "exact", head: true }).eq("subcontractor_id", sub.id).eq("type", "w9");
  check("removing the W-9 deletes the record", docsAfter === docsBefore, `${docsBefore} -> ${docsAfter}`);
  const { data: obj2 } = await db.storage.from("subcontractor-documents").list(sub.id);
  check("and the file", !(obj2 ?? []).some((o) => docs[0].storage_path.endsWith(o.name)));
  uploadedPaths.length = 0;

  // -- a refund arrives from Stripe
  const refund = await postEvent({ id: "evt_e2e_refund_1", type: "refund.created", livemode: false, data: { object: { id: "re_e2e_1", amount: 1000, status: "succeeded", payment_intent: "pi_e2e_1" } } });
  check("webhook: refund recorded", refund.status === 200 && refund.json?.handled === true, JSON.stringify(refund));
  await postEvent({ id: "evt_e2e_refund_1", type: "refund.created", livemode: false, data: { object: { id: "re_e2e_1", amount: 1000, status: "succeeded", payment_intent: "pi_e2e_1" } } });
  const { data: ref2 } = await db.from("invoices").select("status, amount_paid_cents").eq("id", invoiceId).single();
  check("refund reopens the balance once", ref2.amount_paid_cents === TOTAL - 1000 && ref2.status === "partially_paid", JSON.stringify(ref2));
  await page.goto(`${base}/invoices/${invoiceId}`, { waitUntil: "networkidle" });
  const paymentsText = await page.getByTestId("payments").innerText();
  const logCount = await page.getByTestId("activity-log").locator("li").count();
  check("invoice page shows the refund and the activity log", /Refunded \$10\.00/.test(paymentsText) && logCount >= 5, `${paymentsText.replace(/\n/g, " | ")} / log rows ${logCount}`);

  // -- Command Center finance
  await page.goto(`${base}/command-center`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check("Command Center shows five finance tiles to an admin", (await page.getByTestId("finance-tiles").locator("> *").count()) === 5);
  check("Command Center lists overdue invoices", (await page.getByTestId("overdue-list").locator("li").count()) >= 1);

  // -- phone, admin
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await signIn(mob, ADMIN_EMAIL, ADMIN_PASSWORD, /command-center/);
  for (const path of ["/invoices", `/invoices/${invoiceId}`, `/payouts?week=${week}`, "/command-center", "/settings"]) {
    await mp.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await mp.waitForTimeout(600);
    check(`phone: ${path.split("?")[0].replace(invoiceId, "[id]")} fits 390px`, !(await overflow(mp)));
  }
  await mob.close();

  // ================================================================ staff
  const sctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const sp = await signIn(sctx, STAFF_EMAIL, STAFF_PASSWORD, /command-center/);
  await sp.goto(`${base}/invoices`, { waitUntil: "networkidle" });
  check("staff can read the invoice list", (await sp.getByTestId("invoice-row").count()) > 0);
  check("staff see no Create invoice buttons", (await sp.getByRole("button", { name: /Create invoice/ }).count()) === 0);
  await sp.goto(`${base}/invoices/${invoiceId}`, { waitUntil: "networkidle" });
  check("staff see the invoice but can't record payments or void", (await sp.getByTestId("record-payment").count()) === 0 && (await sp.getByRole("button", { name: "Void" }).count()) === 0 && (await sp.getByTestId("invoice-sheet").count()) === 1);
  await sp.goto(`${base}/payouts`, { waitUntil: "networkidle" });
  check("staff are told payouts are owner/admin only", /owner and admins/.test(await sp.locator("main, body").first().innerText()) && (await sp.getByTestId("payout-card").count()) === 0);
  check("staff can't export 1099 totals", (await sp.request.get(`${base}/payouts/1099?year=${nyToday().slice(0, 4)}`)).status() === 403);
  await sp.goto(`${base}/command-center`, { waitUntil: "networkidle" });
  check("staff see three finance tiles (no payouts or margin)", (await sp.getByTestId("finance-tiles").locator("> *").count()) === 3);
  await sctx.close();

  // ================================================================ cleaner
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cp = await signIn(cctx, CREW_EMAIL, CREW_PASSWORD, /my-jobs/);
  await cp.goto(`${base}/invoices`, { waitUntil: "networkidle" });
  check("a cleaner is sent away from invoices", /my-jobs/.test(cp.url()));
  await cp.goto(`${base}/payouts`, { waitUntil: "networkidle" });
  check("and from payouts", /my-jobs/.test(cp.url()));
  check("a cleaner can't download the 1099 CSV", (await cp.request.get(`${base}/payouts/1099?year=${nyToday().slice(0, 4)}`)).status() === 403);
  await cp.goto(`${base}/my-jobs/pay`, { waitUntil: "networkidle" });
  const crewText = await cp.locator("main, body").first().innerText();
  const isThisSub = CREW_EMAIL === "seed+ana@example.com" && sub.display_name.startsWith("Ana");
  if (isThisSub) check("the cleaner sees their paid week", crewText.includes(money(pdb.total_cents)) && /Paid/.test(crewText), crewText.slice(0, 160));
  check("the cleaner's pay page shows no client, invoice or other cleaner", !new RegExp(`${customer.split(" ")[0]}|INV-|Invoice`).test(crewText));
  check("pay page fits 390px", !(await overflow(cp)));
  await cctx.close();
  await ctx.close();
} catch (e) {
  const toasts = await activePage?.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
  await activePage?.screenshot({ path: "/private/tmp/claude-501/fail.png", fullPage: true }).catch(() => {});
  console.log("toasts at failure:", JSON.stringify(toasts), "url:", activePage?.url());
  throw e;
} finally {
  await browser.close();
  await cleanup(t0);
}

console.log(JSON.stringify(results.filter((r) => !r.ok), null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
