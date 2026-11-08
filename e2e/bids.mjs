/**
 * Bids and projects end-to-end test: pricing rules, the bid builder, and projects. Needs a build, no logins: it starts the app, signs in as
 * temporary owner, staff and cleaner users, and puts every row and setting back (the script refuses any
 * project but the cleaning one).
 *
 *   npm run build && npm run e2e:bids
 *
 * Pricing rules: the Settings link and page are for owner/admin only (staff and cleaners are sent away),
 * placeholder numbers are flagged until the first save, a save bumps the version and is logged, bad
 * numbers are explained next to their fields and change nothing, a stale save is refused, and the page
 * has no overflow on a phone.
 *
 * Bid builder: live price and margin as you type, a bid is saved as numbered versions (never overwritten),
 * a price below the floor needs a reason, an older version can be loaded and saved forward, ready then
 * sent moves the opportunity to Bid sent, the printed bid shows scope and price but no cost or margin, and
 * staff cannot open or read bids.
 *
 * Projects: winning a sent bid creates the project (price becomes the contract, the opportunity becomes Won),
 * deposit and final invoices are drafts for 30% and the remainder, a work day is scheduled and staffed with
 * the day's pay, a project cost changes the profit against the bid, the status moves on, the projects list
 * shows it, and staff cannot open or read projects.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");
const PORT = 3181;
const base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = new Date().toISOString();
const users = [];
const password = randomBytes(18).toString("base64url");

const { data: rulesBefore } = await db.from("pricing_rules").select("*").single();
const { data: ratesBefore } = await db.from("pricing_space_rates").select("*");

const BID_PHONE = "+13325550312";
// Deleting an invoice runs trigger functions the API role can't execute, so this one statement goes through the CLI.
function runSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-bids-"));
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
async function cleanBidRows() {
  runSql(`delete from public.invoices where project_id in (select p.id from public.projects p join public.leads l on l.id = p.lead_id join public.contacts c on c.id = l.contact_id where c.phone = '${BID_PHONE}');`);
  const { data: contacts } = await db.from("contacts").select("id, account_id").eq("phone", BID_PHONE);
  for (const c of contacts ?? []) {
    const { data: ls } = await db.from("leads").select("id").eq("contact_id", c.id);
    for (const l of ls ?? []) {
      const { data: pjs } = await db.from("projects").select("id").eq("lead_id", l.id);
      for (const pj of pjs ?? []) {
        await db.from("jobs").delete().eq("project_id", pj.id);
        await db.from("expenses").delete().eq("project_id", pj.id);
        await db.from("projects").delete().eq("id", pj.id);
      }
      await db.from("bids").delete().eq("lead_id", l.id);
      await db.from("activities").delete().eq("lead_id", l.id);
      await db.from("leads").delete().eq("id", l.id);
    }
    await db.from("activities").delete().eq("contact_id", c.id);
    await db.from("contacts").update({ account_id: null }).eq("id", c.id);
    if (c.account_id) { await db.from("properties").delete().eq("account_id", c.account_id); await db.from("accounts").update({ primary_contact_id: null }).eq("id", c.account_id); await db.from("accounts").delete().eq("id", c.account_id); }
    await db.from("contacts").delete().eq("id", c.id);
  }
}

async function cleanup() {
  await cleanBidRows();
  await db.from("pricing_rules").update({ ...rulesBefore }).eq("id", true);
  for (const r of ratesBefore ?? []) await db.from("pricing_space_rates").update(r).eq("space_type", r.space_type);
  await db.from("finance_log").delete().in("entity", ["pricing", "bid", "project"]).gte("occurred_at", t0);
  await db.from("finance_log").delete().eq("entity", "invoice").gte("occurred_at", t0).contains("detail", { from: "project" });
  for (const u of users) {
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
  users.length = 0;
  await db.from("subcontractors").delete().like("display_name", "E2E Bids Cleaner%");
}

await cleanBidRows();
{
  const { data: owned } = await db.from("contacts").select("id").eq("phone", BID_PHONE);
  if (owned?.length) throw new Error(`refusing: ${BID_PHONE} belongs to an existing contact`);
}
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXT_PUBLIC_APP_URL: base }, stdio: "ignore" });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

let browser = null;
const errors = [];
try {
  const make = async (role, extra = {}) => {
    const email = `seed+e2ebids-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    const { error: pe } = await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true, ...extra });
    if (pe) throw pe;
    return { id: data.user.id, email };
  };
  const owner = await make("owner");
  const staff = await make("staff");
  const { data: sub } = await db.from("subcontractors").insert({ display_name: "E2E Bids Cleaner", pay_rate_bps: 4000, status: "active" }).select("id").single();
  const cleaner = await make("subcontractor", { subcontractor_id: sub.id });

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
  const current = async () => (await db.from("pricing_rules").select("*").single()).data;

  // ============================================================ pricing rules
  await db.from("pricing_rules").update({ confirmed_at: null }).eq("id", true);
  const octx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const op = await signIn(octx, owner, /command-center/);
  await op.goto(`${base}/settings`, { waitUntil: "networkidle" });
  check("the owner sees a Pricing rules link in Settings", (await op.getByRole("link", { name: /Pricing rules/ }).count()) === 1);
  await op.goto(`${base}/settings/pricing`, { waitUntil: "networkidle" });
  check("the page loads with its heading", (await op.locator("h1").innerText()) === "Pricing rules");
  check("placeholder numbers are flagged until the first save", await op.getByTestId("pricing-placeholder-note").isVisible());
  check("six kinds of space are listed", (await op.locator('input[id^="pr-rate-"]').count()) === 6);

  // bad input is explained next to the field and changes nothing
  await op.locator("#pr-marginTargetBps").fill("20");
  await op.locator("#pr-marginFloorBps").fill("35");
  await op.getByRole("button", { name: "Save pricing rules" }).click();
  check("a floor above the target is explained on the floor field", await op.getByText("The floor can't be above the target").isVisible());
  await op.locator("#pr-laborRateCents").fill("abc");
  await op.getByRole("button", { name: "Save pricing rules" }).click();
  check("a non-number is explained next to its field", await op.getByText("Enter dollars, like 25").first().isVisible());
  const untouched = await current();
  check("nothing was saved by the bad attempts", untouched.version === rulesBefore.version && untouched.confirmed_at === null);

  // a good save
  await op.goto(`${base}/settings/pricing`, { waitUntil: "networkidle" });
  await op.locator("#pr-marginTargetBps").fill("35");
  await op.locator("#pr-marginFloorBps").fill("22.5");
  await op.locator("#pr-laborRateCents").fill("27.50");
  await op.locator("#pr-rate-office").fill("320");
  await op.getByRole("button", { name: "Save pricing rules" }).click();
  await op.getByText("Pricing rules saved").waitFor({ timeout: 15000 });
  await sleep(800);
  const saved = await current();
  const { data: office } = await db.from("pricing_space_rates").select("*").eq("space_type", "office").single();
  check("the save is stored as cents and basis points with a new version", saved.version === rulesBefore.version + 1 && saved.margin_target_bps === 3500 && saved.margin_floor_bps === 2250 && saved.labor_rate_cents === 2750 && office.rate_per_ksqft_cents === 32000, JSON.stringify(saved));
  check("saving confirms the numbers, so the placeholder note goes", saved.confirmed_at !== null && (await op.getByTestId("pricing-placeholder-note").count()) === 0);
  const { count: logged } = await db.from("finance_log").select("id", { count: "exact", head: true }).eq("entity", "pricing").eq("action", "rules_saved").eq("actor_user_id", owner.id).gte("occurred_at", t0);
  check("the change is in the finance log", logged === 1, String(logged));

  // a stale save is refused, not merged
  await db.from("pricing_rules").update({ version: saved.version + 1 }).eq("id", true);
  await op.locator("#pr-marginTargetBps").fill("40");
  await op.getByRole("button", { name: "Save pricing rules" }).click();
  await sleep(1500);
  const after = await current();
  check("a save made on an old version is refused", after.version === saved.version + 1 && after.margin_target_bps === 3500, JSON.stringify([after.version, after.margin_target_bps]));
  check("no horizontal overflow on desktop", !(await overflow(op)));
  await octx.close();

  // phone
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pp = await signIn(pctx, owner, /command-center/);
  await pp.goto(`${base}/settings/pricing`, { waitUntil: "networkidle" });
  check("no horizontal overflow on a phone", !(await overflow(pp)));
  await pctx.close();

  // ============================================================ bid builder
  // The pricing section left the rules at: labor $27.50, supplies 8% of labor, 35% margin target, floor 22.5%.
  const rulesNow = await current();
  const { data: c0 } = await db.from("contacts").insert({ first_name: "Dana", last_name: "Bidder", phone: BID_PHONE, type: "commercial", address_line1: "5 Court St", zip: "11201", borough: "brooklyn" }).select("id").single();
  const { data: lead } = await db.from("leads").insert({ contact_id: c0.id, service_type: "commercial", stage: "site_visit", source: "referral" }).select("*").single();
  const bctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const bp = await signIn(bctx, owner, /command-center/);
  await bp.goto(`${base}/leads?lead=${lead.id}`, { waitUntil: "networkidle" });
  check("an owner sees Build bid in the opportunity drawer", await bp.getByRole("link", { name: "Build bid" }).isVisible());
  await bp.goto(`${base}/bids/new?lead=${lead.id}`, { waitUntil: "networkidle" });
  check("the builder opens for the opportunity", (await bp.locator("h1").innerText()) === "New bid");
  await bp.locator("#bid-title").fill("E2E whole building");
  await bp.locator("#bid-company").fill("E2E Atlas Builders");
  await bp.locator('[id^="area-label-"]').first().fill("Whole building");
  await bp.getByRole("combobox", { name: /Kind of space for Whole building/ }).click();
  await bp.getByRole("option", { name: "Post-construction" }).click();
  await bp.locator('[id^="area-sqft-"]').first().fill("120000");
  await sleep(500);
  check("the price and margin update as you type", (await bp.getByTestId("bid-price").innerText()) === "$9,138.47" && /35% margin/.test(await bp.getByTestId("bid-margin").innerText()), await bp.getByTestId("bid-summary").innerText());
  check("the summary shows your cost lines and hours", /Labor[\s\S]*\$5,500[\s\S]*Supplies and equipment[\s\S]*\$440[\s\S]*Your cost[\s\S]*\$5,940/.test(await bp.getByTestId("bid-summary").innerText()));
  await bp.getByTestId("bid-save").click();
  await bp.waitForURL(/\/bids\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const bidId = bp.url().split("/").pop();
  const { data: bid } = await db.from("bids").select("*").eq("id", bidId).single();
  const { data: v1 } = await db.from("bid_versions").select("*").eq("bid_id", bidId).eq("version", 1).single();
  check("version 1 is saved with the cost, price, margin and the rules version it used", bid.current_version === 1 && v1.cost_cents === 594000 && v1.price_cents === 913847 && v1.margin_bps === 3500 && v1.rules_version === rulesNow.version, JSON.stringify(v1));
  const { data: lead1 } = await db.from("leads").select("account_id").eq("id", lead.id).single();
  const { data: acct } = await db.from("accounts").select("name").eq("id", lead1.account_id).single();
  check("the company account was created and linked", acct?.name === "E2E Atlas Builders");

  // below the floor needs a reason
  await bp.locator("#ov-price").fill("5000");
  await sleep(400);
  check("a price below the floor is flagged", await bp.getByText("Below your floor").first().isVisible());
  check("saving is blocked until a reason is given", await bp.getByTestId("bid-save").isDisabled());
  await bp.locator("#bid-reason").fill("E2E: anchor client");
  await bp.getByTestId("bid-save").click();
  await bp.getByText("Saved version 2").waitFor({ timeout: 15000 });
  const { data: v2 } = await db.from("bid_versions").select("*").eq("bid_id", bidId).eq("version", 2).single();
  check("version 2 keeps the reason and version 1 is untouched", v2.floor_override_reason === "E2E: anchor client" && v2.price_cents === 500000 && v2.margin_bps < 2250 && (await db.from("bid_versions").select("price_cents").eq("bid_id", bidId).eq("version", 1).single()).data.price_cents === 913847);
  await sleep(600);
  check("both versions are listed", (await bp.getByTestId("bid-versions").getByText(/^Version \d/).count()) === 2);

  // load version 1 and save it forward as version 3
  await bp.getByTestId("bid-versions").getByRole("button", { name: "Load" }).click();
  await sleep(400);
  check("an old version loads into the form", (await bp.getByTestId("bid-price").innerText()) === "$9,138.47");
  await bp.getByTestId("bid-save").click();
  await bp.getByText("Saved version 3").waitFor({ timeout: 15000 });
  await sleep(800);

  // ready, then sent: the opportunity moves to Bid sent and takes the bid's value
  await bp.getByTestId("bid-ready").click();
  await bp.getByText("Marked ready to send").waitFor({ timeout: 15000 });
  await bp.getByTestId("bid-sent").click();
  await bp.getByText(/Marked as sent/).waitFor({ timeout: 15000 });
  const { data: sentBid } = await db.from("bids").select("status, sent_at, valid_until").eq("id", bidId).single();
  const { data: lead2 } = await db.from("leads").select("stage, expected_value_cents").eq("id", lead.id).single();
  check("sent: the bid is marked sent with an expiry date", sentBid.status === "sent" && sentBid.sent_at !== null && sentBid.valid_until !== null);
  check("sent: the opportunity moved to Bid sent and took the bid's price", lead2.stage === "quoted" && lead2.expected_value_cents === 913847, JSON.stringify(lead2));

  // ============================================================ projects
  await bp.goto(`${base}/bids/${bidId}`, { waitUntil: "networkidle" });
  check("a sent bid offers to become a project", await bp.getByTestId("bid-project-panel").isVisible());
  await bp.locator("#pj-new-title").fill("E2E Atlas project");
  await bp.getByTestId("bid-create-project").click();
  await bp.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const projectId = bp.url().split("/").pop();
  const { data: proj } = await db.from("projects").select("*").eq("id", projectId).single();
  const { data: bidAfter } = await db.from("bids").select("status").eq("id", bidId).single();
  const { data: leadWon } = await db.from("leads").select("stage").eq("id", lead.id).single();
  check("the project takes the bid's price as its contract, with a 30% deposit", proj.contract_cents === 913847 && proj.deposit_bps === 3000 && proj.title === "E2E Atlas project" && proj.estimated_cost_cents === 594000, JSON.stringify(proj));
  check("winning marks the bid and the opportunity Won", bidAfter.status === "won" && leadWon.stage === "won");
  check("the project page shows the contract", (await bp.getByTestId("pj-contract").innerText()) === "$9,138.47");

  // milestone invoices
  await bp.getByTestId("pj-deposit").click();
  await bp.getByText("Deposit invoice created as a draft").waitFor({ timeout: 15000 });
  await bp.getByTestId("pj-final").click();
  await bp.getByText("Final payment invoice created as a draft").waitFor({ timeout: 15000 });
  const { data: invs } = await db.from("invoices").select("milestone, status, subtotal_cents, project_id").eq("project_id", projectId);
  const dep = invs.find((i) => i.milestone === "deposit"), fin = invs.find((i) => i.milestone === "final");
  check("the deposit is 30% and the final is the remainder, both drafts", dep?.subtotal_cents === 274154 && fin?.subtotal_cents === 639693 && dep.status === "draft" && fin.status === "draft", JSON.stringify(invs));
  check("a second deposit can't be made", await bp.getByTestId("pj-deposit").isDisabled());
  await sleep(600);
  check("both invoices are listed on the project", (await bp.getByTestId("pj-invoices").locator("li").count()) === 2);

  // a work day with a cleaner
  const tomorrow = new Date(Date.now() + 36 * 3600000).toISOString().slice(0, 10);
  await bp.locator("#pj-day-date").fill(tomorrow);
  await bp.locator("#pj-day-start").fill("08:00");
  await bp.locator("#pj-day-end").fill("16:00");
  await bp.getByTestId("pj-add-day").click();
  await bp.getByText("Work day added").waitFor({ timeout: 15000 });
  const { data: day } = await db.from("jobs").select("id, project_id, price_cents, scheduled_start").eq("project_id", projectId).single();
  check("the work day is a $0 visit on the project, 8am New York time", day.price_cents === 0 && /T1[23]:00:00/.test(day.scheduled_start), JSON.stringify(day));
  await sleep(600);
  await bp.getByTestId("pj-assign").click();
  await bp.getByLabel("E2E Bids Cleaner").check();
  await bp.locator("#pj-daypay").fill("220");
  await bp.getByRole("button", { name: "Assign", exact: true }).click();
  await bp.getByText("Crew assigned").waitFor({ timeout: 15000 });
  const { data: asg } = await db.from("job_assignments").select("pay_cents, subcontractor_id").eq("job_id", day.id);
  check("the cleaner is assigned with the day's pay", asg?.length === 1 && asg[0].pay_cents === 22000 && asg[0].subcontractor_id === sub.id, JSON.stringify(asg));

  // a cost, and profit against the bid
  await bp.locator("#pj-cost-amt").fill("120");
  await bp.locator("#pj-cost-note").fill("Floor wax");
  await bp.getByTestId("pj-add-cost").click();
  await bp.getByText("Cost recorded").waitFor({ timeout: 15000 });
  await sleep(800);
  check("labor, other costs and total cost are shown", (await bp.getByTestId("pj-labor").innerText()) === "$220" && (await bp.getByTestId("pj-other").innerText()) === "$120" && (await bp.getByTestId("pj-cost").innerText()) === "$340");
  check("profit is the contract less actual cost", (await bp.getByTestId("pj-profit").innerText()) === "$8,798.47", await bp.getByTestId("project-profit").innerText());
  const { data: exp } = await db.from("expenses").select("project_id, amount_cents").eq("project_id", projectId);
  check("the cost is stored on the project in cents", exp?.length === 1 && exp[0].amount_cents === 12000);

  // status
  await bp.getByTestId("pj-start").click();
  await bp.getByText("Project started").waitFor({ timeout: 15000 });
  await bp.getByTestId("pj-complete").click();
  await bp.getByText("Project completed").waitFor({ timeout: 15000 });
  check("the project moves to completed", (await db.from("projects").select("status, completed_at").eq("id", projectId).single()).data.status === "completed");
  await bp.goto(`${base}/projects`, { waitUntil: "networkidle" });
  check("the projects list shows it with its contract", /E2E Atlas project/.test(await bp.getByTestId("projects-table").innerText()) && /\$9,138\.47/.test(await bp.getByTestId("projects-table").innerText()));

  // the printed bid
  await bp.goto(`${base}/bids/${bidId}/print`, { waitUntil: "networkidle" });
  const sheet = await bp.getByTestId("bid-sheet").innerText();
  check("the printed bid shows the scope and the price", sheet.includes("Whole building") && sheet.includes("120,000") && (await bp.getByTestId("bid-sheet-total").innerText()) === "$9,138.47");
  check("the printed bid shows no cost, margin or rules", !/margin|your cost|\$5,940|supplies|labor|floor/i.test(sheet), sheet.slice(0, 200));
  check("the printed bid has terms", sheet.includes("Terms"));
  await bctx.close();

  // phone
  const bpc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const bpp = await signIn(bpc, owner, /command-center/);
  await bpp.goto(`${base}/bids/${bidId}`, { waitUntil: "networkidle" });
  check("no horizontal overflow on the builder on a phone", !(await overflow(bpp)));
  await bpp.goto(`${base}/projects/${projectId}`, { waitUntil: "networkidle" });
  check("no horizontal overflow on the project on a phone", !(await overflow(bpp)));
  await bpc.close();

  // staff can't open or read bids
  const stctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const stp = await signIn(stctx, staff, /command-center/);
  await stp.goto(`${base}/bids/${bidId}`);
  await stp.waitForURL(/\/leads/, { timeout: 10000 }).catch(() => {});
  check("staff opening a bid are sent to the pipeline", new URL(stp.url()).pathname === "/leads");
  await stp.goto(`${base}/leads?lead=${lead.id}`, { waitUntil: "networkidle" });
  check("staff see no Build bid link", (await stp.getByRole("link", { name: /Build bid|Open bid/ }).count()) === 0);
  await stp.goto(`${base}/projects/${projectId}`);
  await stp.waitForURL(/\/leads/, { timeout: 10000 }).catch(() => {});
  check("staff opening a project are sent to the pipeline", new URL(stp.url()).pathname === "/leads");
  const sdb2 = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await sdb2.auth.signInWithPassword({ email: staff.email, password });
  const { data: sb } = await sdb2.from("bids").select("id");
  const { data: sv } = await sdb2.from("bid_versions").select("id");
  const { data: sproj } = await sdb2.from("projects").select("id");
  check("staff's own API session reads no bids, versions or projects", (sb ?? []).length === 0 && (sv ?? []).length === 0 && (sproj ?? []).length === 0);
  await stctx.close();

  // staff and cleaners
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await signIn(sctx, staff, /command-center/);
  await sp.goto(`${base}/settings`, { waitUntil: "networkidle" });
  check("staff see no Pricing rules link", (await sp.getByRole("link", { name: /Pricing rules/ }).count()) === 0);
  await sp.goto(`${base}/settings/pricing`);
  await sp.waitForURL(/\/settings$/, { timeout: 10000 }).catch(() => {});
  check("staff opening the pricing page are sent back to Settings", new URL(sp.url()).pathname === "/settings");
  const sdb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await sdb.auth.signInWithPassword({ email: staff.email, password });
  const { data: srows } = await sdb.from("pricing_rules").select("id");
  check("staff's own API session reads no pricing rules", (srows ?? []).length === 0);
  await sctx.close();
  const cdb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await cdb.auth.signInWithPassword({ email: cleaner.email, password });
  const { data: crows } = await cdb.from("pricing_space_rates").select("space_type");
  const rpc = await cdb.rpc("save_pricing_rules", { p_expected_version: 1, p_rules: {} });
  check("a cleaner reads no rates and cannot save rules through the API", (crows ?? []).length === 0 && !!rpc.error);
} finally {
  await browser?.close();
  server.kill();
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(failed, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
