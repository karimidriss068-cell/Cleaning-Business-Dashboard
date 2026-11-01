/**
 * Growth goal end-to-end test, run by hand against a running build and the
 * cleaning project's demo data (the script refuses any other project):
 *
 *   npm run build
 *   GROWTH_API_KEY=e2e-growth-key NEXT_PUBLIC_APP_URL=http://localhost:3133 npx next start -p 3133 &
 *   E2E_BASE=http://localhost:3133 GROWTH_API_KEY=e2e-growth-key \
 *     ADMIN_EMAIL=seed+admin@example.com ADMIN_PASSWORD=... STAFF_EMAIL=seed+staff@example.com STAFF_PASSWORD=... \
 *     CREW_EMAIL=seed+ana@example.com CREW_PASSWORD=... npm run e2e:growth
 *
 * As an admin it edits the assumptions (watching the accounts and leads the
 * plan needs change), edits and rejects a bad milestone set, adds a campaign,
 * enters, replaces and deletes ad spend, changes the cash buffer to turn the
 * scale light red and checks which condition blocks it. Staff can read but not
 * change anything and see no cash; a cleaner is sent away; the bot endpoint
 * needs its key and only answers GET. Everything it changes is restored.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");
const { E2E_BASE: base, GROWTH_API_KEY: key, ADMIN_EMAIL, ADMIN_PASSWORD, STAFF_EMAIL, STAFF_PASSWORD, CREW_EMAIL, CREW_PASSWORD } = process.env;
if (!base || !key || !ADMIN_EMAIL || !ADMIN_PASSWORD || !STAFF_EMAIL || !STAFF_PASSWORD || !CREW_EMAIL || !CREW_PASSWORD) {
  throw new Error("set E2E_BASE, GROWTH_API_KEY, ADMIN_*, STAFF_* and CREW_* (see the header of e2e/growth.mjs)");
}

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail) });
const MARK = "E2E-GROWTH campaign";
const t0 = new Date().toISOString();
const nyToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

function runSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-growth-"));
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

// What to put back at the end.
const { data: settingsBefore } = await db.from("growth_settings").select("*").single();
const { data: goalsBefore } = await db.from("goals").select("metric, period, period_start, period_end, target_value, notes, created_by").eq("metric", "revenue_cents").eq("period", "month");

async function cleanup() {
  const { data: camps } = await db.from("marketing_campaigns").select("id").like("name", `${MARK}%`);
  const ids = (camps ?? []).map((c) => `'${c.id}'`).join(",");
  const restore = { ...settingsBefore };
  for (const k of ["id", "created_at", "updated_at"]) delete restore[k];
  await db.from("growth_settings").update(restore).eq("id", true);
  await db.from("goals").delete().eq("metric", "revenue_cents").eq("period", "month");
  if (goalsBefore?.length) await db.from("goals").insert(goalsBefore);
  runSql(`begin;
${ids ? `delete from public.marketing_daily_stats where campaign_id in (${ids});\ndelete from public.leads where campaign_id in (${ids});\ndelete from public.marketing_campaigns where id in (${ids});` : ""}
delete from public.finance_log where occurred_at >= '${t0}' and entity = 'growth';
commit;`);
}
await cleanup(); // leftovers of an aborted run

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
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const toast = (page, text) => page.getByText(text).first().waitFor({ timeout: 10000 });
const lastLine = (text) => text.trim().split("\n").pop().trim();

try {
  // ================================================================ admin, desktop
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await signIn(ctx, ADMIN_EMAIL, ADMIN_PASSWORD, /command-center/);

  // -- the Command Center card
  const card = page.getByTestId("growth-card");
  await card.waitFor({ timeout: 15000 });
  check("Command Center shows the growth card", (await card.count()) === 1);
  const cardText = await card.innerText();
  check("card: revenue vs milestone, clients per segment, leads per week", /revenue,/i.test(cardText) && /Residential recurring/.test(cardText) && /Commercial accounts/.test(cardText) && /leads per week/i.test(cardText), cardText.slice(0, 200));
  check("card: pace status is a text label", /Starts |Ahead of pace|On track|Behind pace/.test(cardText));
  check("card: demo data is labeled", /Includes demo data/.test(cardText));
  check("card links to leads, invoices and the plan", (await card.locator('a[href="/leads"], a[href="/invoices"], a[href="/growth"]').count()) === 3);
  check("card: scale light shown to admin", (await page.getByTestId("growth-scale-light").count()) === 1);

  // -- /growth
  await page.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("growth page loads", (await page.getByRole("heading", { name: "Growth", level: 1 }).count()) === 1);
  check("six milestones listed", (await page.getByTestId("milestone-list").locator("li").count()) === 6);
  check("capacity panel shows a percentage and the 80% marker text", /of capacity/.test(await page.getByTestId("capacity-panel").innerText()) && /80%/.test(await page.getByTestId("capacity-panel").innerText()));
  check("cash panel shows runway", /Runway/.test(await page.getByTestId("cash-panel").innerText()));

  // -- assumptions: editing changes what the plan needs
  const needBefore = lastLine(await page.getByTestId("needs-residential-clients").innerText());
  await page.fill("#as-price", "200");
  await page.fill("#as-close", "25");
  const needAfter = lastLine(await page.getByTestId("needs-residential-clients").innerText());
  check("residential clients needed updates live ($200 x 2 visits: 16)", needBefore !== needAfter && needAfter === "16", `${needBefore} -> ${needAfter}`);
  check("leads per week updates live", lastLine(await page.getByTestId("needs-leads-needed").innerText()) !== "", "");
  await page.fill("#as-close", "0");
  await page.click('[data-testid="save-growth-assumptions"]');
  check("a 0% close rate is rejected inline", (await page.getByText("Enter a percent from 0.01 to 100").count()) >= 1);
  await page.fill("#as-close", "25");
  await page.click('[data-testid="save-growth-assumptions"]');
  await toast(page, "Assumptions saved");
  const { data: s1 } = await db.from("growth_settings").select("res_visit_price_cents, close_rate_bps").single();
  check("assumptions saved in cents and basis points", s1.res_visit_price_cents === 20000 && s1.close_rate_bps === 2500, JSON.stringify(s1));
  await page.reload({ waitUntil: "networkidle" });
  check("assumptions persist after a reload", (await page.inputValue("#as-price")) === "200" && (await page.inputValue("#as-close")) === "25");

  // -- milestones: a bad set is rejected, a good change is stored in cents
  const lastBox = page.locator("#plan-m5");
  await lastBox.fill("9000");
  await page.click('[data-testid="save-growth-plan"]');
  check("a last milestone that isn't the goal is rejected inline", (await page.getByText(/last milestone must equal the monthly goal/).count()) >= 1);
  const { data: gBad } = await db.from("goals").select("target_value").eq("metric", "revenue_cents").eq("period", "month").order("period_start");
  const before = [...goalsBefore].sort((a, b) => a.period_start.localeCompare(b.period_start)).map((g) => g.target_value).join();
  check("nothing was saved by the rejected plan", gBad.map((g) => g.target_value).join() === before, `${gBad.map((g) => g.target_value).join()} vs ${before}`);
  await lastBox.fill("10000");
  await page.fill("#plan-m1", "2600");
  await page.click('[data-testid="save-growth-plan"]');
  await toast(page, "Growth plan saved");
  const { data: g1 } = await db.from("goals").select("target_value, period_start").eq("metric", "revenue_cents").eq("period", "month").order("period_start");
  check("six milestone rows in cents, month 2 changed", g1.length === 6 && g1[1].target_value === 260000 && g1[5].target_value === 1000000, JSON.stringify(g1.map((g) => g.target_value)));

  // -- campaign and ad spend
  const today = nyToday();
  await page.fill("#campaign-name", `${MARK} meta`);
  await page.click('[data-testid="add-campaign"]');
  await toast(page, "Campaign added");
  const { data: camp } = await db.from("marketing_campaigns").select("id, platform").eq("name", `${MARK} meta`).single();
  check("campaign created on the Meta platform", camp?.platform === "meta");
  await page.fill("#spend-amount", "42.50");
  await page.click('[data-testid="add-ad-spend"]');
  await toast(page, "Ad spend saved");
  const { data: sp1 } = await db.from("marketing_daily_stats").select("id, spend_cents, date").eq("campaign_id", camp.id);
  check("spend saved as integer cents for today", sp1.length === 1 && sp1[0].spend_cents === 4250 && sp1[0].date === today, JSON.stringify(sp1));
  await page.waitForFunction(() => document.querySelector('[data-testid="recent-spend"]')?.textContent?.includes("$42.50"), null, { timeout: 10000 });
  check("entry appears under recent entries", (await page.getByTestId("recent-spend").innerText()).includes("$42.50"));
  await page.fill("#spend-amount", "50");
  await page.click('[data-testid="add-ad-spend"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="recent-spend"]')?.textContent?.includes("$50"), null, { timeout: 10000 });
  const { data: sp2 } = await db.from("marketing_daily_stats").select("spend_cents").eq("campaign_id", camp.id);
  check("entering the same day again replaces it", sp2.length === 1 && sp2[0].spend_cents === 5000, JSON.stringify(sp2));
  await page.fill("#spend-amount", "-5");
  await page.click('[data-testid="add-ad-spend"]');
  check("negative spend is rejected inline", (await db.from("marketing_daily_stats").select("spend_cents").eq("campaign_id", camp.id)).data[0].spend_cents === 5000);
  check("campaign table lists the new campaign", (await page.getByTestId("campaign-table").innerText()).includes(`${MARK} meta`));
  await page.getByRole("button", { name: /^Delete .*spend on/ }).first().click();
  await toast(page, "Entry deleted");
  check("spend deleted", ((await db.from("marketing_daily_stats").select("id").eq("campaign_id", camp.id)).data ?? []).length === 0);

  // -- cash buffer: raise it above cash on hand and the light goes red, naming cash
  await page.fill("#cash-buffer", "9999999");
  await page.click('[data-testid="save-cash-settings"]');
  await toast(page, "Cash settings saved");
  await page.reload({ waitUntil: "networkidle" });
  const light = page.getByTestId("scale-light");
  check("scale light is red when cash is under the buffer", (await light.getAttribute("data-status")) === "red");
  check("it names the cash condition as blocking", (await page.getByTestId("condition-cash").getAttribute("data-state")) === "fail" && /Blocking/.test(await page.getByTestId("condition-cash").innerText()));
  check("cash panel warns about the buffer", /minimum buffer/.test(await page.getByTestId("cash-panel").innerText()));
  await page.fill("#cash-buffer", "1000");
  await page.click('[data-testid="save-cash-settings"]');
  await toast(page, "Cash settings saved");
  await page.reload({ waitUntil: "networkidle" });
  check("cash condition passes again with a $1,000 buffer", (await page.getByTestId("condition-cash").getAttribute("data-state")) !== "fail");
  const sl = await page.getByTestId("scale-light").innerText();
  check("each of the four conditions is listed", /Lead reply time/.test(sl) && /Cleaner capacity/.test(sl) && /CAC payback/.test(sl) && /Cash buffer/.test(sl));

  // -- the bot endpoint
  const noKey = await fetch(`${base}/api/growth/snapshot`);
  check("snapshot without a key is 401", noKey.status === 401);
  const wrong = await fetch(`${base}/api/growth/snapshot`, { headers: { authorization: "Bearer nope" } });
  check("snapshot with a wrong key is 401", wrong.status === 401);
  const ok = await fetch(`${base}/api/growth/snapshot`, { headers: { authorization: `Bearer ${key}` } });
  const snap = await ok.json();
  check("snapshot with the key returns goal, pace, ads, capacity, cash and the light", ok.status === 200 && snap.goal && snap.pace && snap.ads && snap.capacity && snap.cash && snap.scaleLight, Object.keys(snap).join());
  check("snapshot money is integer cents", Number.isInteger(snap.goal.monthlyGoalCents) && Number.isInteger(snap.pace.revenueCents) && Number.isInteger(snap.cash.onHandCents));
  check("snapshot says it includes demo data", snap.includesDemo === true);
  const post = await fetch(`${base}/api/growth/snapshot`, { method: "POST", headers: { authorization: `Bearer ${key}` } });
  check("the endpoint can't write: POST is 405", post.status === 405);

  // -- admin on a phone
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await signIn(mctx, ADMIN_EMAIL, ADMIN_PASSWORD, /command-center/);
  check("Command Center fits 390px with the growth card", !(await overflow(mp)));
  await mp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("growth page fits 390px", !(await overflow(mp)));
  await mctx.close();
  await ctx.close();

  // ================================================================ staff: read only, no cash
  const sctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const sp = await signIn(sctx, STAFF_EMAIL, STAFF_PASSWORD, /command-center/);
  await sp.getByTestId("growth-card").waitFor({ timeout: 15000 });
  check("staff see the growth card", (await sp.getByTestId("growth-card").count()) === 1);
  check("staff don't see the scale light on the card", (await sp.getByTestId("growth-scale-light").count()) === 0);
  await sp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  const staffText = await sp.locator("main, body").first().innerText();
  check("staff can read the plan", (await sp.getByTestId("milestone-list").locator("li").count()) === 6);
  check("staff have no save buttons or spend entry", (await sp.locator('[data-testid^="save-"], [data-testid="add-ad-spend"], [data-testid="add-campaign"]').count()) === 0);
  check("staff see no cash or scale light", (await sp.getByTestId("cash-panel").count()) === 0 && (await sp.getByTestId("scale-light").count()) === 0 && /only the owner or an admin sees it/.test(staffText));
  check("staff fields are disabled", await sp.locator("#as-price").isDisabled());
  await sctx.close();

  // ================================================================ cleaner
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cp = await signIn(cctx, CREW_EMAIL, CREW_PASSWORD, /my-jobs/);
  await cp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("a cleaner is sent away from growth", /my-jobs/.test(cp.url()));
  await cctx.close();
} catch (e) {
  const toasts = await activePage?.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
  await activePage?.screenshot({ path: "/private/tmp/claude-501/fail.png", fullPage: true }).catch(() => {});
  console.log("toasts at failure:", JSON.stringify(toasts), "url:", activePage?.url());
  throw e;
} finally {
  await browser.close();
  await cleanup();
}

console.log(JSON.stringify(results.filter((r) => !r.ok), null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
