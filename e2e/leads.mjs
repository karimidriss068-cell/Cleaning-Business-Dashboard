/**
 * Leads & Pipeline end-to-end test, run by hand against a running build and
 * the cleaning project's demo data (the script refuses any other project):
 *
 *   npm run build && npx next start -p 3132 &
 *   E2E_BASE=http://localhost:3132 STAFF_EMAIL=seed+staff@example.com STAFF_PASSWORD=... \
 *     CREW_EMAIL=seed+ana@example.com CREW_PASSWORD=... npm run e2e:leads
 *
 * As office staff on desktop: drags a lead between stages, adds a lead with
 * quick add (Cmd+K), sees the duplicate warning, converts the lead to a
 * customer with a draft quote, and drags it to Lost (which asks why). On a
 * phone: moves a lead with the Move sheet. As a cleaner: cannot reach or read
 * leads. Everything it creates or changes is removed or restored.
 */
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");
const { E2E_BASE: base, STAFF_EMAIL: email, STAFF_PASSWORD: password, CREW_EMAIL: crewEmail, CREW_PASSWORD: crewPassword } = process.env;
if (!base || !email || !password) throw new Error("set E2E_BASE, STAFF_EMAIL and STAFF_PASSWORD");

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
const SEED_LO = "5eed0000-0000-0000-0000-000000000000";
const SEED_HI = "5eed0001-0000-0000-0000-000000000000";
const NOT_SEED = `id.lt.${SEED_LO},id.gte.${SEED_HI}`;
const PHONE = "+16465550199";
const stageOf = async (id) => (await db.from("leads").select("*").eq("id", id).single()).data;

async function cleanTestRows() {
  const { data: contacts } = await db.from("contacts").select("id").eq("phone", PHONE);
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
    await db.from("contacts").delete().eq("id", c.id);
  }
}
await cleanTestRows();

// A demo lead in New to drag around, remembered so it can be restored.
const { data: pick } = await db.from("leads").select("*, contact:contacts(first_name, last_name)").eq("stage", "new").gte("id", SEED_LO).lt("id", SEED_HI).limit(1).single();
const original = { stage: pick.stage, lost_reason: pick.lost_reason, closed_at: pick.closed_at, first_response_at: pick.first_response_at, next_follow_up_on: pick.next_follow_up_on, stage_changed_at: pick.stage_changed_at };
const pickName = `${pick.contact.first_name} ${pick.contact.last_name ?? ""}`.trim();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
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
await page.getByRole("heading", { level: 1, name: "Leads & Pipeline" }).waitFor();
await page.waitForTimeout(600);
const cols = await page.locator('[data-testid="board"] [data-stage]').count();
check("board shows five stage columns", cols === 5, String(cols));
check("stages use the business words", (await page.locator('[data-testid="board"]').innerText()).includes("Quote sent") && (await page.locator('[data-testid="board"]').innerText()).includes("Booked"));

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

// 1. drag New -> Contacted
await card_visible(pick.id);
async function card_visible(id) { await page.locator(`[data-testid="board"] [data-lead-card="${id}"]`).scrollIntoViewIfNeeded(); }
await drag(pick.id, "contacted");
await page.waitForTimeout(1500);
let row = await stageOf(pick.id);
check("dragging a card changes its stage in the database", row.stage === "contacted", row.stage);
check("the card sits in the Contacted column", (await page.locator(`[data-stage="contacted"] [data-lead-card="${pick.id}"]`).count()) === 1);
const { count: moves } = await db.from("activities").select("id", { count: "exact", head: true }).eq("lead_id", pick.id).eq("type", "status_change").or(NOT_SEED);
check("the move is on the lead's timeline", moves === 1, String(moves));

// 2. drag to Lost asks why first
await drag(pick.id, "lost");
await page.waitForTimeout(700);
check("dropping on Lost asks for a reason", await page.getByLabel(/Why was it lost/).isVisible().catch(() => false));
check("the lead has not moved yet", (await stageOf(pick.id)).stage === "contacted");
await page.getByLabel(/Why was it lost/).fill("Chose a cheaper company");
await page.getByRole("button", { name: "Move lead" }).click();
await page.waitForTimeout(1500);
row = await stageOf(pick.id);
check("Lost is saved with its reason", row.stage === "lost" && row.lost_reason === "Chose a cheaper company" && row.closed_at !== null);

// 3. keyboard path: Move… menu back to New
await page.getByRole("button", { name: `Move ${pickName}` }).first().focus();
await page.keyboard.press("Enter");
await page.getByRole("radio", { name: /^New/ }).click();
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
await page.getByLabel("Phone").fill("(646) 555-0199");
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
await page.getByLabel("Phone").fill("646-555-0199");
await page.waitForTimeout(1200);
check("typing a known phone shows the duplicate warning", await page.getByTestId("duplicate-warning").isVisible().catch(() => false));
check("Add lead stays disabled until acknowledged", await page.getByRole("button", { name: "Add lead" }).isDisabled());
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// 6. convert
await page.locator(`[data-testid="board"] [data-lead-card="${newLead.id}"]`).getByRole("button", { name: /^Eli E2E Tester/ }).click();
await page.getByRole("button", { name: "Convert to customer" }).click();
await page.waitForTimeout(2200);
const { data: quote } = await db.from("quotes").select("id, status, contact_id").eq("lead_id", newLead.id).maybeSingle();
const { data: cust } = await db.from("contacts").select("customer_since").eq("id", made[0].id).single();
check("convert opens a draft quote for the customer", quote?.status === "draft" && quote.contact_id === made[0].id);
check("convert marks the contact as a customer", cust.customer_since !== null);
check("the drawer now shows the quote", await page.getByText(/quote #\d+/i).first().isVisible().catch(() => false));
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
await phone.getByRole("radio", { name: /^Contacted/ }).click();
await phone.getByRole("button", { name: "Move lead" }).click();
await phone.waitForTimeout(1500);
check("the phone Move sheet changes the stage", (await stageOf(pick.id)).stage === "contacted");
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal scroll on the phone", overflow <= 0, String(overflow));
await pctx.close();

// ---- cleaner cannot see leads
if (crewEmail && crewPassword) {
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const cp = await signIn(cctx, crewEmail, crewPassword, /my-jobs/);
  await cp.goto(`${base}/leads`);
  await cp.waitForURL(/my-jobs/, { timeout: 10000 }).catch(() => {});
  check("a cleaner opening /leads is sent to My jobs", new URL(cp.url()).pathname.startsWith("/my-jobs"));
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: crewEmail, password: crewPassword });
  const { data: rows } = await anon.from("leads").select("id").limit(5);
  check("a cleaner's own API session reads zero leads", (rows ?? []).length === 0);
  const rpc = await anon.rpc("create_lead", { p_first_name: "No", p_phone: "6465550123", p_service_type: "residential", p_source: "other" });
  check("a cleaner cannot create a lead through the API", !!rpc.error);
  await cctx.close();
}

// ---- restore
await cleanTestRows();
await db.from("activities").delete().eq("lead_id", pick.id).or(NOT_SEED);
await db.from("leads").update(original).eq("id", pick.id);
if (errors.length) check("no page errors", false, errors.join(" | "));
await browser.close();

const bad = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  (${r.detail})`}`);
console.log(`\n${results.length - bad.length}/${results.length} checks passed`);
process.exit(bad.length ? 1 : 0);
