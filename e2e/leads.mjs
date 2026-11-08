/**
 * Pipeline (opportunities) end-to-end test. Needs a build, no logins and no demo data: it starts the app,
 * signs in as temporary staff and cleaner users and makes its own commercial opportunity, then removes
 * everything (the script refuses any project but the cleaning one).
 *
 *   npm run build && npm run e2e:leads
 *
 * As office staff on desktop: sees the six stages, that a residential opportunity is hidden, drags one
 * between stages, adds one with quick add (Cmd+K), sees the duplicate warning, saves the bid fields
 * (value, bid due date, site visit, chance), creates the account and a draft bid, and drags to Lost
 * (which asks why). On a phone: moves one with the Move sheet. As a cleaner: cannot reach or read them.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");
const PORT = 3180;
const base = `http://localhost:${PORT}`;

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHONE = "+13325550199";
const PICK_PHONE = "+13325550198";
const RES_PHONE = "+13325550197";
const PHONES = [PHONE, PICK_PHONE, RES_PHONE];
const password = randomBytes(18).toString("base64url");
const users = [];
const stageOf = async (id) => (await db.from("leads").select("*").eq("id", id).single()).data;

async function cleanTestRows() {
  for (const phone of PHONES) {
    const { data: contacts } = await db.from("contacts").select("id, account_id").eq("phone", phone);
    for (const c of contacts ?? []) {
      const { data: ls } = await db.from("leads").select("id").eq("contact_id", c.id);
      for (const l of ls ?? []) {
        const { data: qs } = await db.from("quotes").select("id").eq("lead_id", l.id);
        for (const q of qs ?? []) { await db.from("quote_items").delete().eq("quote_id", q.id); await db.from("quotes").delete().eq("id", q.id); }
        await db.from("activities").delete().eq("lead_id", l.id);
        await db.from("leads").delete().eq("id", l.id);
      }
      await db.from("properties").delete().eq("contact_id", c.id);
      await db.from("activities").delete().eq("contact_id", c.id);
      await db.from("contacts").update({ account_id: null }).eq("id", c.id);
      if (c.account_id) { await db.from("properties").delete().eq("account_id", c.account_id); await db.from("accounts").update({ primary_contact_id: null }).eq("id", c.account_id); await db.from("accounts").delete().eq("id", c.account_id); }
      await db.from("contacts").delete().eq("id", c.id);
    }
  }
  for (const u of users) {
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
  users.length = 0;
  await db.from("subcontractors").delete().like("display_name", "E2E Leads Cleaner%");
}
await cleanTestRows();
// A phone that belongs to anyone else means this script would touch a real person's rows.
for (const phone of PHONES) {
  const { data: owned } = await db.from("contacts").select("id").eq("phone", phone);
  if (owned?.length) throw new Error(`refusing: ${phone} belongs to an existing contact`);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXT_PUBLIC_APP_URL: base }, stdio: "ignore" });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

const make = async (role, extra = {}) => {
  const email = `seed+e2eleads-${role}-${randomBytes(3).toString("hex")}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user);
  const { error: pe } = await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true, ...extra });
  if (pe) throw pe;
  return { id: data.user.id, email };
};
const mkLead = async (phone, first, serviceType, stage, extra = {}) => {
  const { data: c, error: ce } = await db.from("contacts").insert({ first_name: first, last_name: "E2E", phone, type: serviceType === "commercial" ? "commercial" : "residential" }).select("id").single();
  if (ce) throw ce;
  const { data: l, error: le } = await db.from("leads").insert({ contact_id: c.id, service_type: serviceType, stage, source: "referral", ...extra }).select("*").single();
  if (le) throw le;
  return { ...l, contactName: `${first} E2E` };
};

let browser = null;
const errors = [];
let pick;
try {
  const staff = await make("staff");
  const cleaner = await (async () => {
    const { data: sub, error } = await db.from("subcontractors").insert({ display_name: "E2E Leads Cleaner", pay_rate_bps: 4000, status: "active" }).select("id").single();
    if (error) throw error;
    return make("subcontractor", { subcontractor_id: sub.id });
  })();
  // A commercial opportunity to drag around, and a residential one that must stay hidden.
  const picked = await mkLead(PICK_PHONE, "Atlas", "commercial", "new", { expected_value_cents: 750000 });
  const hidden = await mkLead(RES_PHONE, "Hidden", "residential", "new");
  pick = picked;
  const pickName = picked.contactName;
  const email = staff.email;

  browser = await chromium.launch({ channel: "chrome", headless: true });
  async function signIn(ctx, em, pw, landing) {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.fill("#email", em); await page.fill("#password", pw);
    await page.click('button[type="submit"]');
    await page.waitForURL(landing, { timeout: 20000 });
    return page;
  }

// ---- desktop, staff
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await signIn(ctx, email, password, /command-center|leads/);
await page.goto(`${base}/leads`, { waitUntil: "networkidle" });
await page.getByRole("heading", { level: 1, name: "Pipeline" }).waitFor();
await page.waitForTimeout(600);
const cols = await page.locator('[data-testid="board"] [data-stage]').count();
check("board shows the six stage columns", cols === 6, String(cols));
check("a residential opportunity is hidden from the pipeline", (await page.locator(`[data-lead-card="${hidden.id}"]`).count()) === 0 && !(await page.locator("body").innerText()).includes("Hidden E2E"));
check("the commercial one is shown with its value", (await page.locator(`[data-testid="board"] [data-lead-card="${pick.id}"]`).innerText()).includes("$7,500"));
check("stages use the business words", (await page.locator('[data-testid="board"]').innerText()).includes("Bid sent") && (await page.locator('[data-testid="board"]').innerText()).includes("Won"));

async function drag(leadId, stage) {
  const card = page.locator(`[data-testid="board"] [data-lead-card="${leadId}"]`);
  const target = page.locator(`[data-testid="board"] [data-stage="${stage}"]`);
  const a = await card.boundingBox();
  const b = await target.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 14);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 30, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 140, { steps: 14 });
  await page.mouse.up();
}

// 1. drag Lead -> Site visit
await card_visible(pick.id);
async function card_visible(id) { await page.locator(`[data-testid="board"] [data-lead-card="${id}"]`).scrollIntoViewIfNeeded(); }
await drag(pick.id, "site_visit");
await page.waitForTimeout(1500);
let row = await stageOf(pick.id);
check("dragging a card changes its stage in the database", row.stage === "site_visit", row.stage);
check("the card sits in the Site visit column", (await page.locator(`[data-stage="site_visit"] [data-lead-card="${pick.id}"]`).count()) === 1);
const { count: moves } = await db.from("activities").select("id", { count: "exact", head: true }).eq("lead_id", pick.id).eq("type", "status_change");
check("the move is on the lead's timeline", moves === 1, String(moves));

// 2. drag to Lost asks why first
await drag(pick.id, "lost");
await page.waitForTimeout(700);
check("dropping on Lost asks for a reason", await page.getByLabel(/Why was it lost/).isVisible().catch(() => false));
check("the lead has not moved yet", (await stageOf(pick.id)).stage === "site_visit");
await page.getByLabel(/Why was it lost/).fill("Chose a cheaper company");
await page.getByRole("button", { name: "Move lead" }).click();
await page.waitForTimeout(1500);
row = await stageOf(pick.id);
check("Lost is saved with its reason", row.stage === "lost" && row.lost_reason === "Chose a cheaper company" && row.closed_at !== null);

// 3. keyboard path: Move… menu back to New
await page.getByRole("button", { name: `Move ${pickName}` }).first().focus();
await page.keyboard.press("Enter");
await page.getByRole("radio", { name: /^Lead/ }).click();
await page.getByRole("button", { name: "Move lead" }).click();
await page.waitForTimeout(1500);
check("the Move… sheet works from the keyboard-reachable button", (await stageOf(pick.id)).stage === "new");

// 4. quick add via Cmd+K
await page.keyboard.press("Control+k");
await page.getByRole("combobox").fill("new lead");
await page.keyboard.press("Enter");
await page.getByLabel("First name").waitFor();
await page.getByLabel("First name").fill("Eli");
await page.getByLabel("Last name").fill("E2E Tester");
await page.getByLabel("Phone").fill("(332) 555-0199");
await page.getByLabel("Email").fill("Eli.E2E@Example.com");
await page.waitForTimeout(700);
await page.getByRole("button", { name: "Add lead" }).click();
await page.waitForTimeout(2000);
const { data: made } = await db.from("contacts").select("id, phone, email, first_name").eq("phone", PHONE);
check("quick add creates the contact with a normalized phone and lowercase email", made?.length === 1 && made[0].email === "eli.e2e@example.com");
const { data: newLead } = await db.from("leads").select("*").eq("contact_id", made[0].id).single();
check("the new lead starts in New with a follow-up date and an owner", newLead.stage === "new" && !!newLead.next_follow_up_on && !!newLead.owner_id);
await page.reload({ waitUntil: "networkidle" });
check("the new lead appears on the board", (await page.locator(`[data-testid="board"] [data-stage="new"] [data-lead-card="${newLead.id}"]`).count()) === 1);

// 5. duplicate warning
await page.getByRole("button", { name: "New lead" }).click();
await page.getByLabel("First name").fill("Eli");
await page.getByLabel("Phone").fill("332-555-0199");
await page.waitForTimeout(1200);
check("typing a known phone shows the duplicate warning", await page.getByTestId("duplicate-warning").isVisible().catch(() => false));
check("Add lead stays disabled until acknowledged", await page.getByRole("button", { name: "Add lead" }).isDisabled());
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// 6. convert
await page.locator(`[data-testid="board"] [data-lead-card="${newLead.id}"]`).getByRole("button", { name: /^Eli E2E Tester/ }).click();
// 5b. bid fields
await page.locator("#ld-value").fill("abc");
await page.getByRole("button", { name: "Save changes" }).click();
check("a bad project value is explained next to the form", await page.getByText("Enter the project value in dollars").isVisible().catch(() => false));
await page.locator("#ld-value").fill("8,250");
await page.locator("#ld-bid-due").fill("2099-02-01");
await page.locator("#ld-visit-date").fill("2099-01-20");
await page.locator("#ld-visit-time").fill("14:30");
await page.locator("#ld-win").fill("40");
await page.getByRole("button", { name: "Save changes" }).click();
await page.waitForTimeout(1500);
const saved = await stageOf(newLead.id);
check("the bid fields are saved in cents and New York time", saved.expected_value_cents === 825000 && saved.bid_due_on === "2099-02-01" && saved.win_probability_bps === 4000 && new Date(saved.site_visit_at).toISOString() === "2099-01-20T19:30:00.000Z", JSON.stringify([saved.expected_value_cents, saved.bid_due_on, saved.win_probability_bps, saved.site_visit_at]));
// The drawer closes after a save, so reopen the card to carry on.
await page.locator(`[data-testid="board"] [data-lead-card="${newLead.id}"]`).getByRole("button", { name: /^Eli E2E Tester/ }).click();
await page.getByRole("button", { name: "Create account and bid" }).click();
await page.waitForTimeout(2200);
const { data: quote } = await db.from("quotes").select("id, status, contact_id").eq("lead_id", newLead.id).maybeSingle();
const { data: cust } = await db.from("contacts").select("customer_since").eq("id", made[0].id).single();
check("creating the account opens a draft bid", quote?.status === "draft" && quote.contact_id === made[0].id);
check("creating the account marks the contact as a customer", cust.customer_since !== null);
check("the drawer now shows the bid", await page.getByText(/draft bid #\d+/i).first().isVisible().catch(() => false));
check("the timeline records the conversion", (await page.getByTestId("timeline").innerText()).includes("Converted to customer"));
await page.getByLabel("Activity text").fill("Called, wants Tuesday morning");
await page.getByRole("button", { name: "Log it" }).click();
await page.waitForTimeout(1500);
check("a call note lands on the timeline", (await page.getByTestId("timeline").innerText()).includes("Called, wants Tuesday morning"));
await ctx.close();

// ---- phone, staff
const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await signIn(pctx, email, password, /command-center|leads/);
await phone.goto(`${base}/leads`, { waitUntil: "networkidle" });
await phone.waitForTimeout(600);
check("phone shows the stage-grouped list, not the board", (await phone.getByTestId("lead-list").isVisible()) && !(await phone.getByTestId("board").isVisible()));
await phone.getByTestId("lead-list").getByRole("button", { name: `Move ${pickName}` }).click();
await phone.getByRole("radio", { name: /^Site visit/ }).click();
await phone.getByRole("button", { name: "Move lead" }).click();
await phone.waitForTimeout(1500);
check("the phone Move sheet changes the stage", (await stageOf(pick.id)).stage === "site_visit");
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal scroll on the phone", overflow <= 0, String(overflow));
await pctx.close();

// ---- cleaner cannot see leads
{
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await signIn(cctx, cleaner.email, password, /my-jobs/);
  await cp.goto(`${base}/leads`);
  await cp.waitForURL(/my-jobs/, { timeout: 10000 }).catch(() => {});
  check("a cleaner opening /leads is sent to My jobs", new URL(cp.url()).pathname.startsWith("/my-jobs"));
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: cleaner.email, password });
  const { data: rows } = await anon.from("leads").select("id").limit(5);
  check("a cleaner's own API session reads zero leads", (rows ?? []).length === 0);
  const rpc = await anon.rpc("create_lead", { p_first_name: "No", p_phone: "3325550123", p_service_type: "commercial", p_source: "other" });
  check("a cleaner cannot create a lead through the API", !!rpc.error);
  await cctx.close();
}

if (errors.length) check("no page errors", false, errors.join(" | "));
} finally {
  await browser?.close();
  server.kill();
  await cleanTestRows();
}

const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  (${r.detail})`}`);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
