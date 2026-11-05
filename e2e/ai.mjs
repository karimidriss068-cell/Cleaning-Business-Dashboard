/**
 * AI spend control end-to-end test. Needs no provider keys and no pasted logins: nothing here calls a
 * model. It talks to the cleaning project's database with the service role (the script refuses any other
 * project), starts the built app, and creates and deletes its own temporary owner, admin and staff users.
 *
 *   npm run build
 *   npm run e2e:ai
 *
 * Part A (database): 40 reservations fired at once against a small cap are admitted only up to the cap,
 * never past it, then again after settling; the kill switch refuses everything and lifts again.
 * Part B (browser, as a temporary owner): /settings/ai-usage shows spend by feature and bot, the caps
 * editor saves, rejects bad amounts, adds and removes a cap, the kill switch works, the 80% alert shows on
 * the page and the Command Center banner (owner only), admin and staff are kept out, and every
 * direction x theme at 1440px and 390px. The caps and switch are put back exactly as they were found.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3154;
const base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = new Date().toISOString();
const users = [];

const { data: budgetsBefore } = await db.from("ai_budgets").select("*");
const { data: settingsBefore } = await db.from("ai_settings").select("*").single();

async function cleanup() {
  await db.from("ai_usage").delete().like("feature", "e2e-%");
  await db.from("ai_usage").delete().like("actor_id", "e2e-%");
  await db.from("finance_log").delete().eq("entity", "ai").gte("occurred_at", t0);
  const keep = (budgetsBefore ?? []).map((b) => b.id);
  const { data: now } = await db.from("ai_budgets").select("id");
  for (const b of now ?? []) if (!keep.includes(b.id)) await db.from("ai_budgets").delete().eq("id", b.id);
  for (const b of budgetsBefore ?? []) {
    await db.from("ai_budgets").update({ daily_cap_cents: b.daily_cap_cents, monthly_cap_cents: b.monthly_cap_cents, hard_stop: b.hard_stop }).eq("id", b.id);
  }
  await db.from("ai_settings").update({ kill_switch: settingsBefore.kill_switch }).eq("id", true);
  for (const u of users) {
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
}
await cleanup(); // leftovers of an aborted run

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXT_PUBLIC_APP_URL: base }, stdio: "ignore" });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

const reserve = (feature, est, actor = ["system", "e2e-cron"]) =>
  db.rpc("ai_reserve", { p_actor_type: actor[0], p_actor_id: actor[1], p_feature: feature, p_provider: "anthropic", p_model: "claude-haiku-5-5", p_est_micros: est });
const okCount = (rs) => rs.filter((r) => r.data?.ok === true).length;

let browser = null;
const errors = [];
try {
  // ============================================================ Part A: caps under concurrency
  await db.from("ai_budgets").insert({ scope: "feature", scope_key: "e2e-conc", daily_cap_cents: 10, monthly_cap_cents: 10 });
  const first = await Promise.all(Array.from({ length: 40 }, () => reserve("e2e-conc", 15_000)));
  check("no reserve call errored", first.every((r) => !r.error), JSON.stringify(first.find((r) => r.error)));
  check("40 at once against a 10-cent cap: exactly 6 admitted (6 x 15,000 <= 100,000)", okCount(first) === 6, okCount(first));
  const { data: heldRows } = await db.from("ai_usage").select("cost_micros").eq("feature", "e2e-conc").eq("status", "reserved");
  check("what is held never passes the cap", (heldRows ?? []).reduce((n, r) => n + r.cost_micros, 0) <= 100_000, JSON.stringify(heldRows?.length));
  check("the other 34 were refused and logged", (await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("feature", "e2e-conc").eq("status", "refused")).count === 34);
  check("the refusal names the scope and window", first.some((r) => r.data?.reason === "budget" && r.data?.scope === "feature" && r.data?.window === "daily"));
  for (const r of first.filter((x) => x.data?.ok)) await db.rpc("ai_settle", { p_usage_id: r.data.usage_id, p_input: 100, p_output: 50, p_cached: 0, p_cache_write: 0, p_cost_micros: 5_000 });
  const second = await Promise.all(Array.from({ length: 40 }, () => reserve("e2e-conc", 15_000)));
  check("after settling to 30,000 real spend: exactly 4 more fit", okCount(second) === 4, okCount(second));
  const { data: all } = await db.from("ai_usage").select("cost_micros").eq("feature", "e2e-conc").in("status", ["reserved", "settled"]);
  check("spent plus held ends at or under the cap", (all ?? []).reduce((n, r) => n + r.cost_micros, 0) <= 100_000, (all ?? []).reduce((n, r) => n + r.cost_micros, 0));
  const { data: cents } = await db.from("ai_usage").select("cost_micros, cost_cents").eq("feature", "e2e-conc").eq("status", "settled").limit(1).single();
  check("cost_cents is the micros rounded up", cents.cost_cents === Math.ceil(cents.cost_micros / 10_000), JSON.stringify(cents));

  // bots get separate default caps, even when asked for at the same moment
  const bots = await Promise.all(["e2e-bot-a", "e2e-bot-b"].flatMap((id) => Array.from({ length: 10 }, () => reserve("e2e-bots", 20_000, ["bot", id]))));
  const perBot = ["e2e-bot-a", "e2e-bot-b"].map((id) => bots.filter((r, i) => r.data?.ok && Math.floor(i / 10) === (id === "e2e-bot-a" ? 0 : 1)).length);
  const def = (budgetsBefore ?? []).find((b) => b.scope === "bot" && b.scope_key === "*");
  const expectEach = def?.daily_cap_cents != null ? Math.min(10, Math.floor((def.daily_cap_cents * 10_000) / 20_000)) : 10;
  check("each bot is held to its own default daily cap", perBot[0] === expectEach && perBot[1] === expectEach, JSON.stringify({ perBot, expectEach }));

  // kill switch
  await db.from("ai_settings").update({ kill_switch: true }).eq("id", true);
  const killed = await Promise.all(Array.from({ length: 5 }, () => reserve("e2e-free", 1)));
  check("kill switch refuses every call", killed.every((r) => r.data?.ok === false && r.data?.reason === "kill_switch"));
  await db.from("ai_settings").update({ kill_switch: false }).eq("id", true);
  check("lifting it lets calls through again", (await reserve("e2e-free", 1)).data?.ok === true);

  // ============================================================ Part B: the page
  const password = randomBytes(18).toString("base64url");
  const make = async (role) => {
    const email = `seed+e2eai-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true });
    return { id: data.user.id, email };
  };
  const owner = await make("owner");
  const admin = await make("admin");
  const staff = await make("staff");
  // 85% of a daily cap, so the alert shows, and some spend by a named bot.
  await db.from("ai_budgets").upsert({ scope: "feature", scope_key: "e2e-alert", daily_cap_cents: 100, monthly_cap_cents: 1000 }, { onConflict: "scope,scope_key" });
  await db.from("ai_usage").insert([
    { actor_type: "bot", actor_id: "e2e-roast", feature: "e2e-alert", provider: "anthropic", model: "claude-haiku-5-5", status: "settled", cost_micros: 850_000, input_tokens: 1000, output_tokens: 500, settled_at: new Date().toISOString() },
  ]);

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
  const dbCap = async (scope, key) => (await db.from("ai_budgets").select("*").eq("scope", scope).eq("scope_key", key).maybeSingle()).data;

  const octx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const op = await signIn(octx, owner, /command-center/);
  await op.getByTestId("ai-budget-banner").waitFor({ timeout: 15000 }).catch(() => undefined);
  check("the owner's Command Center shows the AI budget banner", (await op.getByTestId("ai-budget-banner").count()) === 1 && /(Nearing a cap|Cap reached)/.test(await op.getByTestId("ai-budget-banner").innerText()));
  await op.goto(`${base}/settings`, { waitUntil: "networkidle" });
  await op.getByRole("link", { name: /AI usage/ }).click();
  await op.waitForURL(/ai-usage/);
  check("page loads with a heading, overview and kill switch", (await op.locator("h1").innerText()) === "AI usage" && (await op.getByTestId("ai-overview").count()) === 1 && (await op.getByTestId("ai-kill-switch").count()) === 1);
  check("the 80% alert is on the page", /85% used/.test(await op.getByTestId("ai-alerts").innerText()));
  check("spend by feature lists the feature with its spend", /e2e-alert/.test(await op.getByTestId("ai-by-feature").innerText()) && /\$[0-9]/.test(await op.getByTestId("ai-by-feature").innerText()));
  check("spend by bot lists the bot", /e2e-roast/.test(await op.getByTestId("ai-by-actor").innerText()));
  check("the defaults are shown: global, board and each bot", (await op.getByTestId("cap-global-*").count()) === 1 && (await op.getByTestId("cap-feature-board").count()) === 1 && (await op.getByTestId("cap-bot-*").count()) === 1);
  check("provider keys show as set or missing, never their values", /key (set|missing)/.test(await op.getByTestId("ai-overview").innerText()));

  // caps editor
  const botRow = op.getByTestId("cap-bot-*");
  await botRow.getByLabel("Daily cap ($)").fill("0.60");
  await botRow.getByLabel("Monthly cap ($)").fill("6");
  await op.getByTestId("cap-bot-*-save").click();
  await op.waitForFunction(async () => true);
  const saved = await (async () => { for (let i = 0; i < 20; i++) { const c = await dbCap("bot", "*"); if (c?.daily_cap_cents === 60) return c; await sleep(400); } return await dbCap("bot", "*"); })();
  check("editing the default bot cap saves 60 and 600 cents", saved?.daily_cap_cents === 60 && saved?.monthly_cap_cents === 600, JSON.stringify(saved));
  check("the change is logged", ((await db.from("finance_log").select("id").eq("entity", "ai").eq("action", "budget_saved").gte("occurred_at", t0)).data?.length ?? 0) >= 1);
  await op.getByTestId("cap-global-*").getByLabel("Daily cap ($)").fill("abc");
  await op.getByTestId("cap-global-*-save").click();
  check("a bad amount is explained next to the field and nothing is saved", (await op.getByTestId("cap-global-*").getByRole("alert").count()) === 1 && (await dbCap("global", "*")).daily_cap_cents === (budgetsBefore.find((b) => b.scope === "global").daily_cap_cents));
  await op.getByTestId("cap-global-*").getByLabel("Daily cap ($)").fill("9999");
  await op.getByTestId("cap-global-*-save").click();
  check("a daily cap above the monthly one is refused", /can.t be more than the monthly/.test(await op.getByTestId("cap-global-*").innerText()));
  await op.reload({ waitUntil: "networkidle" });
  await op.getByLabel("Name").fill("e2e-added");
  await op.getByLabel("Daily ($)").fill("0.25");
  await op.getByLabel("Monthly ($)").fill("1");
  await op.getByRole("button", { name: "Add", exact: true }).click();
  await op.getByTestId("cap-bot-e2e-added").waitFor({ timeout: 15000 });
  const added = await dbCap("bot", "e2e-added");
  check("adding a cap for a named bot works", added?.daily_cap_cents === 25 && added?.monthly_cap_cents === 100 && added?.hard_stop === true, JSON.stringify(added));
  await op.getByRole("button", { name: /Remove the cap for Bot: e2e-added/ }).click();
  await op.getByTestId("cap-bot-e2e-added").waitFor({ state: "detached", timeout: 15000 });
  check("removing it deletes it", (await dbCap("bot", "e2e-added")) === null);
  await op.getByTestId("cap-feature-board").getByRole("checkbox", { name: /Hard stop/ }).click();
  await op.getByTestId("cap-feature-board-save").click();
  await sleep(1500);
  check("hard stop can be turned off for a cap", (await dbCap("feature", "board"))?.hard_stop === false);

  // kill switch from the page
  await op.getByTestId("ai-kill-toggle").click();
  await op.getByText("AI is off").first().waitFor({ timeout: 15000 });
  check("the kill switch button turns AI off", (await db.from("ai_settings").select("kill_switch").single()).data.kill_switch === true);
  check("while it is off every call is refused", (await reserve("e2e-free", 1)).data?.reason === "kill_switch");
  check("the page and banner say so", /switched off/.test(await op.getByTestId("ai-alerts").innerText()));
  await op.getByTestId("ai-kill-toggle").click();
  await op.getByText("AI is on").first().waitFor({ timeout: 15000 });
  check("and the same button turns it back on", (await db.from("ai_settings").select("kill_switch").single()).data.kill_switch === false);
  await octx.close();

  // admin and staff are kept out; the banner is the owner's alone
  for (const [who, name] of [[admin, "admin"], [staff, "staff"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await signIn(ctx, who, /command-center|leads|schedule/);
    await p.goto(`${base}/settings/ai-usage`, { waitUntil: "networkidle" });
    check(`${name} is sent back from AI usage`, !/ai-usage/.test(p.url()));
    await p.goto(`${base}/command-center`, { waitUntil: "networkidle" });
    check(`${name} sees no AI budget banner`, (await p.getByTestId("ai-budget-banner").count()) === 0);
    await p.goto(`${base}/settings`, { waitUntil: "networkidle" });
    check(`${name} sees no AI usage link`, (await p.getByRole("link", { name: /AI usage/ }).count()) === 0);
    await ctx.close();
  }

  // every direction x theme, desktop and phone
  const prefs = [];
  for (const direction of ["titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });
  for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
    for (const p of prefs) {
      await db.from("user_preferences").upsert({ user_id: owner.id, direction: p.direction, theme: p.theme });
      const page = ctx.pages()[0] ?? (await signIn(ctx, owner, /command-center/));
      for (const path of ["/settings/ai-usage", "/command-center"]) {
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        const attrs = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
        const bad = (await overflow(page)) ? "overflow" : attrs.d !== p.direction || attrs.dark !== (p.theme === "dark") ? `wrong theme ${JSON.stringify(attrs)}` : (await page.locator("h1").count()) < 1 ? "no heading" : path === "/command-center" && (await page.getByTestId("ai-budget-banner").count()) !== 1 ? "no banner" : "";
        check(`${path} ${label} ${p.direction} ${p.theme}`, bad === "", bad);
        if (process.env.E2E_SHOTS_DIR && path === "/settings/ai-usage") await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/ai-${label}-${p.direction}-${p.theme}.png`, fullPage: true });
      }
    }
    await ctx.close();
  }
} finally {
  await browser?.close();
  server.kill();
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(failed, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
