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
 * scale light red and checks which condition blocks it. It also adds and removes an
 * expense (watching profit), switches the tier, views the channel test and tries a
 * plan that would breach the cash buffer, and corrects a lead's channel. Staff can read but not
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
const SEED_LO = "5eed0000-0000-0000-0000-000000000000";
const SEED_HI = "5eed0001-0000-0000-0000-000000000000";
let leadRestore = null;
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
const { data: planBefore } = await db.from("channel_test_plan").select("channel, enabled");
const { data: goalsBefore } = await db.from("goals").select("metric, period, period_start, period_end, target_value, notes, created_by").eq("metric", "revenue_cents").eq("period", "month");

async function cleanup() {
  if (leadRestore) {
    await db.from("leads").update({ channel: leadRestore.channel, creative: leadRestore.creative }).eq("id", leadRestore.id);
    await db.from("activities").delete().eq("lead_id", leadRestore.id).like("subject", "Attribution set to%");
  }
  const { data: camps } = await db.from("marketing_campaigns").select("id").like("name", `${MARK}%`);
  const ids = (camps ?? []).map((c) => `'${c.id}'`).join(",");
  const restore = { ...settingsBefore };
  for (const k of ["id", "created_at", "updated_at"]) delete restore[k];
  await db.from("growth_settings").update(restore).eq("id", true);
  for (const p of planBefore ?? []) await db.from("channel_test_plan").update({ enabled: p.enabled }).eq("channel", p.channel);
  await db.from("goals").delete().eq("metric", "revenue_cents").eq("period", "month");
  if (goalsBefore?.length) await db.from("goals").insert(goalsBefore);
  runSql(`begin;
${ids ? `delete from public.marketing_daily_stats where campaign_id in (${ids});\ndelete from public.leads where campaign_id in (${ids});\ndelete from public.marketing_campaigns where id in (${ids});` : ""}
delete from public.expenses where description like 'E2E-GROWTH%';
delete from public.growth_decisions where note like 'E2E-GROWTH%';
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
  await page.goto(`${base}/growth/settings`, { waitUntil: "networkidle" });
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


  // -- profit: add an expense and watch other costs and net profit move
  await page.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("profit panel shows the month's revenue, cleaner pay, ads, other costs, net profit and margin", await page.getByTestId("profit-panel").getByText(/Net profit/).first().isVisible() && (await page.getByTestId("profit-margin").count()) === 1);
  await page.fill("#exp-amount", "85.50");
  await page.fill("#exp-desc", "E2E-GROWTH expense");
  await page.click('[data-testid="add-expense"]');
  await toast(page, "Expense saved");
  const { data: ex1 } = await db.from("expenses").select("id, amount_cents, category, incurred_on").eq("description", "E2E-GROWTH expense");
  check("expense saved as integer cents for today", ex1.length === 1 && ex1[0].amount_cents === 8550 && ex1[0].incurred_on === today && ex1[0].category === "supplies", JSON.stringify(ex1));
  await page.waitForFunction(() => document.querySelector('[data-testid="expense-list"]')?.textContent?.includes("E2E-GROWTH expense"), null, { timeout: 10000 });
  check("expense appears in the list", true);
  await page.fill("#exp-amount", "0");
  await page.click('[data-testid="add-expense"]');
  check("a zero expense is rejected inline", ((await db.from("expenses").select("id").eq("description", "E2E-GROWTH expense")).data ?? []).length === 1);
  await page.getByRole("button", { name: /^Delete .*expense of \$85\.50/ }).first().click();
  await toast(page, "Expense deleted");
  check("expense deleted", ((await db.from("expenses").select("id").eq("description", "E2E-GROWTH expense")).data ?? []).length === 0);

  // -- tiers: three side by side, track another
  check("three tiers are shown side by side", (await page.getByTestId("tiers-panel").locator('[data-testid^="tier-"]').count()) === 3);
  check("the base tier is the one being tracked", (await page.getByTestId("tier-base").getAttribute("data-selected")) !== null);
  check("forecast shows base, strong and north star", (await page.getByTestId("forecast-panel").locator('[data-testid^="forecast-"]').count()) === 3);
  check("five go/no-go gates are shown", (await page.getByTestId("gates-panel").locator('[data-testid^="gate-"]').count()) === 5);
  check("three hire triggers are shown", (await page.getByTestId("hire-triggers").locator('[data-testid^="hire-"]').count()) === 3);
  await page.click('[data-testid="tier-pick-strong"]');
  await page.click('[data-testid="save-tiers"]');
  await toast(page, "Tiers saved");
  check("tracking another tier is saved", (await db.from("growth_settings").select("tier").single()).data.tier === "strong");
  await page.reload({ waitUntil: "networkidle" });
  check("the strong tier is now the tracked one", (await page.getByTestId("tier-strong").getAttribute("data-selected")) !== null);
  await page.fill("#tier-strong", "40000");
  await page.click('[data-testid="save-tiers"]');
  check("a strong tier at or below the base tier is rejected inline", (await page.getByText("The strong tier must be above the base tier").count()) >= 1);

  // -- gates: edit a threshold
  await page.locator("summary", { hasText: "Edit the gates" }).click();
  await page.fill('[id="gate-month3/month_revenue_cents"]', "4500");
  await page.click('[data-testid="save-gates"]');
  await toast(page, "Gate criteria saved");
  check("gate threshold saved in cents", (await db.from("growth_gate_criteria").select("threshold").eq("checkpoint", "month3").eq("metric", "month_revenue_cents").single()).data.threshold === 450000);
  await page.fill('[id="gate-month3/month_revenue_cents"]', "4000");
  await page.click('[data-testid="save-gates"]');
  await toast(page, "Gate criteria saved");

  // -- funnel
  check("funnel shows cost per booked client and per recurring client", /cost per booked client/i.test(await page.getByTestId("funnel-panel").innerText()) && /cost per recurring client/i.test(await page.getByTestId("funnel-panel").innerText()));
  const chRows = await page.getByTestId("funnel-table").locator("tbody tr").count();
  check("the funnel lists all six channels", chRows === 6, chRows);
  await page.click('[data-testid="funnel-view-campaigns"]');
  check("the funnel can be grouped by campaign", (await page.getByTestId("funnel-table").locator("tbody tr").count()) >= 1);
  await page.click('[data-testid="funnel-view-creatives"]');
  check("and by creative", (await page.getByTestId("funnel-table").count()) === 1 || /No creative is tagged yet/.test(await page.getByTestId("funnel-panel").innerText()));
  check("reply-time buckets with booking rates", (await page.getByTestId("reply-buckets").locator('[data-testid^="reply-"]').count()) === 3);
  check("churn tracker shows the average and the assumption", /Average over these months/.test(await page.getByTestId("churn-tracker").innerText()));

  // -- channel test view and the cash buffer
  const test = page.getByTestId("channel-test");
  check("channel test shows six channels side by side", (await test.getByTestId("channel-cards").locator('[data-testid^="channel-card-"]').count()) === 6);
  check("it shows a recommendation", (await test.getByTestId("recommendation").getAttribute("data-state")) !== null);
  check("the recommendation says what to do", /Keep testing|Shift|Keep scaling/.test(await test.getByTestId("recommendation").innerText()));
  check("default rules: $750 and 20 leads", (await page.inputValue("#ct-spend")) === "750" && (await page.inputValue("#ct-leads")) === "20" && (await page.inputValue("#ct-ratio")) === "1.5");
  check("default daily budgets $20 then $30 over 4 weeks", (await page.inputValue("#ct-w1")) === "20" && (await page.inputValue("#ct-after")) === "30" && (await page.inputValue("#ct-weeks")) === "4");
  check("the default plan fits above the buffer", (await page.getByTestId("budget-ok").count()) === 1);
  await page.fill("#ct-w1", "5000");
  await page.fill("#ct-after", "5000");
  check("a plan that would breach the buffer is flagged as you type", /buffer/.test(await page.getByTestId("budget-warning").innerText()));
  check("and can't be saved", await page.getByTestId("save-channel-test").isDisabled());
  const dailyBefore = (await db.from("growth_settings").select("test_daily_week1_cents").single()).data.test_daily_week1_cents;
  check("nothing was saved by the blocked plan", dailyBefore === 2000, dailyBefore);
  // the database refuses it too, whatever the page says
  const adminDb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await adminDb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const refused = await adminDb.rpc("save_channel_test", { p_judge_spend_cents: 75000, p_judge_leads: 20, p_loser_ratio_x100: 150, p_daily_week1_cents: 500000, p_daily_after_cents: 500000, p_window_weeks: 4, p_start_date: null, p_channels: ["meta"] });
  check("the database refuses a plan that would breach the buffer", refused.error?.code === "KC005" && /buffer/.test(refused.error.message), refused.error?.message);
  await page.fill("#ct-w1", "25");
  await page.fill("#ct-after", "35");
  await page.fill("#ct-spend", "800");
  await page.click('[data-testid="save-channel-test"]');
  await toast(page, "Channel test saved");
  const { data: ts } = await db.from("growth_settings").select("test_judge_spend_cents, test_daily_week1_cents, test_daily_after_cents").single();
  check("a plan within the buffer saves in cents", ts.test_judge_spend_cents === 80000 && ts.test_daily_week1_cents === 2500 && ts.test_daily_after_cents === 3500, JSON.stringify(ts));
  await page.getByRole("checkbox", { name: "Test Google LSA" }).click();
  await page.click('[data-testid="save-channel-test"]');
  await toast(page, "Channel test saved");
  let lsaOff = false;
  for (let i = 0; i < 20 && !lsaOff; i++) {
    lsaOff = (await db.from("channel_test_plan").select("enabled").eq("channel", "google_lsa").single()).data.enabled === false;
    if (!lsaOff) await page.waitForTimeout(500);
  }
  check("channels in the test can be switched off", lsaOff);
  await page.getByTestId("log-recommendation").click();
  await page.fill("#rec-note", "E2E-GROWTH keep going");
  await page.click('[data-testid="save-recommendation-decision"]');
  await toast(page, "Decision logged");
  const { data: dl } = await db.from("growth_decisions").select("kind, decision").like("note", "E2E-GROWTH%");
  check("logging the recommendation writes a decision, and nothing else changes", dl.length === 1 && dl[0].kind === "channel", JSON.stringify(dl));
  await page.reload({ waitUntil: "networkidle" });
  check("the decision shows in the log", (await page.getByTestId("decision-list").innerText()).includes("E2E-GROWTH keep going"));
  await page.getByRole("button", { name: /^Delete the decision/ }).first().click();
  await toast(page, "Decision deleted");

  // -- a lead's channel and creative can be corrected from the lead
  const { data: leadRows } = await db.from("leads").select("id, channel, creative, contact:contacts(first_name)").in("stage", ["new", "contacted", "quoted"]).gte("id", SEED_LO).lt("id", SEED_HI).limit(1);
  const lead = leadRows[0];
  leadRestore = { id: lead.id, channel: lead.channel, creative: lead.creative };
  await page.goto(`${base}/leads`, { waitUntil: "networkidle" });
  await page.locator(`[data-lead-card="${lead.id}"]`).getByRole("button").first().click();
  await page.getByLabel("Ad attribution").waitFor({ timeout: 10000 });
  await page.getByRole("combobox", { name: "Channel" }).click();
  await page.getByRole("option", { name: lead.channel === "google_lsa" ? "Referral" : "Google LSA" }).click();
  await page.fill("#ld-creative", "E2E-GROWTH creative");
  await page.click('[data-testid="save-attribution"]');
  await toast(page, "Attribution saved");
  const { data: l1 } = await db.from("leads").select("channel, creative").eq("id", lead.id).single();
  check("the lead's channel and creative are saved", l1.channel === (lead.channel === "google_lsa" ? "referral" : "google_lsa") && l1.creative === "E2E-GROWTH creative", JSON.stringify(l1));
  await page.goto(`${base}/growth`, { waitUntil: "networkidle" });

  // -- the bot endpoint
  const noKey = await fetch(`${base}/api/growth/snapshot`);
  check("snapshot without a key is 401", noKey.status === 401);
  const wrong = await fetch(`${base}/api/growth/snapshot`, { headers: { authorization: "Bearer nope" } });
  check("snapshot with a wrong key is 401", wrong.status === 401);
  const ok = await fetch(`${base}/api/growth/snapshot`, { headers: { authorization: `Bearer ${key}` } });
  const snap = await ok.json();
  check("snapshot with the key returns goal, pace, ads, capacity, cash and the light", ok.status === 200 && snap.goal && snap.pace && snap.ads && snap.capacity && snap.cash && snap.scaleLight, Object.keys(snap).join());
  check("snapshot carries the north star: tiers, profit, forecast, gates, funnel and the channel test", ["tiers", "profit", "forecast", "gates", "hireTriggers", "decisions", "funnel", "replyBuckets", "churn", "channelTest"].every((k) => k in snap && snap[k] !== undefined), Object.keys(snap).join());
  check("snapshot has three tiers, five gates, six channels and a recommendation", snap.tiers.paces.length === 3 && snap.gates.length === 5 && snap.funnel.channels.length === 6 && typeof snap.channelTest.recommendation.state === "string");
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
  check("staff see the tiers, gates, funnel and channel test", (await sp.getByTestId("tiers-panel").count()) === 1 && (await sp.getByTestId("gates-panel").count()) === 1 && (await sp.getByTestId("funnel-panel").count()) === 1 && (await sp.getByTestId("channel-test").count()) === 1);
  check("staff don't see profit, expenses or the cleaner-pay line", /only the owner or an admin sees it/.test(await sp.getByTestId("profit-panel").innerText()) && (await sp.getByTestId("expense-panel").count()) === 0);
  check("staff can't add an expense, edit the gates or save the test", (await sp.getByTestId("add-expense").count()) === 0 && (await sp.getByTestId("save-gates").count()) === 0 && (await sp.getByTestId("save-channel-test").count()) === 0);
  check("staff still see the recommendation, but can't log a decision", (await sp.getByTestId("recommendation").count()) === 1 && (await sp.getByTestId("log-recommendation").count()) === 0);
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
