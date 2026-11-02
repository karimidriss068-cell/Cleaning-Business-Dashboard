/**
 * Roast Room (/board) end-to-end test. Needs no provider keys and no pasted logins: a fake Anthropic
 * server on this machine answers every model call, the built app is pointed at it, and the script creates
 * and deletes its own temporary owner, admin and staff users. It talks to the cleaning project's database
 * with the service role (and refuses any other project).
 *
 *   npm run build
 *   npm run e2e:board
 *
 * Covers: the page and its AI label, the live estimate, inline validation, a run (3 advisors on the small
 * model, one synthesis on the larger, max_tokens set, persona prompt cached, usage metered under feature
 * "board"), the 24-hour repeat cache, two rounds with the business snapshot (no contact data or secrets
 * in anything sent), the Log decision button, a cap refusal and the kill switch (nothing saved, nothing
 * sent), owner/admin only (staff are redirected and the table is closed to them), and every direction x
 * theme at 1440px and 390px. Caps, the switch and every row it makes are put back.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3156;
const FAKE_PORT = 3157;
const base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = new Date().toISOString();
const users = [];
const tag = randomBytes(3).toString("hex");

const { data: budgetsBefore } = await db.from("ai_budgets").select("*");
const { data: settingsBefore } = await db.from("ai_settings").select("*").single();

async function cleanup() {
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const { data: sessions } = await db.from("board_sessions").select("id, logged_decision_id").in("created_by", ids);
    await db.from("board_sessions").delete().in("created_by", ids);
    const decisionIds = (sessions ?? []).map((s) => s.logged_decision_id).filter(Boolean);
    if (decisionIds.length) await db.from("growth_decisions").delete().in("id", decisionIds);
    await db.from("growth_decisions").delete().in("created_by", ids);
    await db.from("ai_usage").delete().in("actor_id", ids);
  }
  await db.from("finance_log").delete().in("entity", ["board", "ai"]).gte("occurred_at", t0);
  await db.from("finance_log").delete().eq("entity", "growth").eq("action", "decision_logged").gte("occurred_at", t0);
  for (const b of budgetsBefore ?? []) {
    await db.from("ai_budgets").update({ daily_cap_cents: b.daily_cap_cents, monthly_cap_cents: b.monthly_cap_cents, hard_stop: b.hard_stop }).eq("id", b.id);
  }
  await db.from("ai_settings").update({ kill_switch: settingsBefore.kill_switch }).eq("id", true);
  for (const u of users) {
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
}
await cleanup();

// ---- the fake Anthropic: records what it is sent and answers like the real API ----
const requests = [];
const SYN = {
  verdict: "Hire a part-time closer, but only after you have recorded your own sales calls.",
  summary: "Cash is thin and your hours are limited, so a capped, commission-only trial is the safest way to test it.",
  agreements: ["Do not hire a full-time salesperson yet."],
  disagreements: ["How soon to start the trial."],
  actions: [
    { title: "Record 10 of your own sales calls this week", why: "You need a script before anyone else sells." },
    { title: "Write the one-page offer and price list", why: "A closer needs something to sell." },
    { title: "Post a commission-only closer role", why: "Test demand at no fixed cost." },
  ],
};
const fake = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    requests.push({ path: req.url, key: req.headers["x-api-key"], model: j.model, max_tokens: j.max_tokens, system: j.system?.[0]?.text ?? "", cached: Boolean(j.system?.[0]?.cache_control), user: j.messages?.[0]?.content ?? "" });
    const synth = String(j.model).includes("sonnet");
    const text = synth ? JSON.stringify(SYN) : `Stance: proceed carefully.\nWhy: the numbers allow a small test.\nBiggest risk: cash.\nWhat I would do: run a capped trial. (${requests.length})`;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }));
  });
});
await new Promise((r) => fake.listen(FAKE_PORT, "127.0.0.1", r));

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: { ...process.env, NEXT_PUBLIC_APP_URL: base, AI_ANTHROPIC_BASE: `http://127.0.0.1:${FAKE_PORT}`, CLEANING_ANTHROPIC_API_KEY: "sk-fake-e2e-board" },
  stdio: "ignore",
});
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

let browser = null;
const errors = [];
try {
  const password = randomBytes(18).toString("base64url");
  const make = async (role) => {
    const email = `seed+e2eboard-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true });
    return { id: data.user.id, email };
  };
  const owner = await make("owner");
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
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const sessionCount = async () => (await db.from("board_sessions").select("id", { count: "exact", head: true }).eq("created_by", owner.id)).count ?? 0;
  const usageRows = async () => (await db.from("ai_usage").select("*").eq("actor_id", owner.id).eq("feature", "board")).data ?? [];
  const runAndWait = async (page, question) => {
    await page.getByLabel("Your business question or decision").fill(question);
    await page.getByTestId("board-run").click();
    await page.waitForURL(/\/board\/[0-9a-f-]{36}/, { timeout: 60000 });
    await page.getByTestId("board-synthesis").waitFor({ timeout: 15000 });
  };

  const octx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const op = await signIn(octx, owner, /command-center/);

  // ============================================================ the page
  check("the owner's sidebar has a Roast Room link", (await op.getByRole("link", { name: "Roast Room" }).count()) >= 1);
  await op.goto(`${base}/board`, { waitUntil: "networkidle" });
  check("the page loads with its heading", (await op.locator("h1").innerText()) === "Roast Room");
  check("advisors are labelled as AI approximations, not real people", /AI approximation[\s\S]*Not real people/.test(await op.getByTestId("board-ai-label").innerText()));
  check("eight advisors, three ticked by default (cash/ruin, offers/pricing, operations)", (await op.getByTestId("board-advisors").getByRole("checkbox").count()) === 8
    && (await op.getByTestId("board-advisors").getByRole("checkbox", { checked: true }).count()) === 3);
  for (const n of ["Cash & ruin", "Offers & pricing", "Operations"]) check(`${n} is ticked`, (await op.getByRole("checkbox", { name: n }).getAttribute("aria-checked")) === "true");
  // The figure counts up the first time it is seen, so read the final value (the last dollar amount shown).
  const lastDollars = (t) => Number([...t.matchAll(/\$([0-9]+\.[0-9]{2})/g)].at(-1)?.[1]);
  const settle = async () => { await sleep(1500); return op.getByTestId("board-estimate").innerText(); };
  const est1 = await settle();
  check("an estimate is shown before running", /up to[\s\S]*\$[0-9]+\.[0-9]{2}[\s\S]*for 4 AI calls/.test(est1), est1);
  await op.getByRole("checkbox", { name: "Strategy & reversibility" }).click();
  await op.getByRole("checkbox", { name: "Include a snapshot of my business numbers" }).click();
  const est2 = await settle();
  check("the estimate rises with another advisor and the snapshot, and counts the calls", /for 5 AI calls/.test(est2) && lastDollars(est2) > lastDollars(est1), `${lastDollars(est1)} -> ${lastDollars(est2)}`);
  await op.getByRole("checkbox", { name: "Strategy & reversibility" }).click();
  await op.getByRole("checkbox", { name: "Include a snapshot of my business numbers" }).click();

  // validation
  await op.getByTestId("board-run").click();
  check("an empty question is explained next to the field", (await op.locator("#board-question-help").getByRole("alert").count()) === 1);
  await op.getByLabel("Your business question or decision").fill("x".repeat(4001));
  await op.getByTestId("board-run").click();
  check("a question over 4,000 characters is refused inline", /under 4,000/.test(await op.locator("#board-question-help").innerText()));
  check("nothing was sent to the model or saved", requests.length === 0 && (await sessionCount()) === 0);

  // ============================================================ a run
  const q1 = `e2e ${tag}: Should I hire a part-time closer for residential leads or spend the same money on Google ads? I have 12 hours a week.`;
  await runAndWait(op, q1);
  const sessionUrl = op.url();
  check("a run opens the saved session", /\/board\/[0-9a-f-]{36}$/.test(sessionUrl));
  check("three advisor cards, each marked AI", (await op.getByTestId("board-advisor-card").count()) === 3 && (await op.getByTestId("board-advisor-card").first().innerText()).includes("AI"));
  check("the synthesis shows the verdict and exactly three actions", (await op.getByTestId("board-verdict").innerText()) === SYN.verdict && (await op.getByTestId("board-action").count()) === 3);
  check("the cost is shown", (await op.getByTestId("board-cost").innerText()).includes("$"));
  // the boardroom replays the saved answers (no model call)
  check("the session page has the boardroom, in the signal-chamber style, with the chair and three advisors", (await op.getByTestId("board-room").count()) === 1 && (await op.getByTestId("boardroom").getAttribute("data-style")) === "b" && (await op.getByTestId("scene-stage").locator('[data-testid^="seat-"]').count()) === 4);
  await op.getByTestId("scene-skip").click();
  await op.getByTestId("scene-verdict").waitFor({ timeout: 10000 });
  await op.getByTestId("scene-actions").locator("li").nth(2).waitFor({ timeout: 10000 });
  check("skip to verdict shows the saved verdict and the three saved actions in order", (await op.getByTestId("scene-verdict").innerText()).includes(SYN.verdict) && (await op.getByTestId("scene-actions").locator("li").allInnerTexts()).every((t, i) => t.includes(SYN.actions[i].title)));
  check("votes are read from the stances and all three are counted", (await Promise.all(["for", "conditional", "against"].map(async (v) => Number((await op.getByTestId(`score-${v}`).innerText()).match(/^\s*(\d+)/)?.[1] ?? 0)))).reduce((a, b) => a + b, 0) === 3);
  check("the dissent shows the saved disagreement", (await op.getByTestId("scene-dissent").innerText()).includes(SYN.disagreements[0]));
  check("watching it called no model", requests.length === 4);
  check("four model calls: three small-model advisors and one larger-model synthesis", requests.length === 4
    && requests.filter((r) => r.model === "claude-haiku-5-5").length === 3 && requests.filter((r) => r.model === "claude-sonnet-5-5").length === 1, JSON.stringify(requests.map((r) => r.model)));
  check("every call sets max_tokens (700 advisors, 1200 synthesis) and caches the persona prompt", requests.every((r) => r.cached) && requests.filter((r) => r.model.includes("haiku")).every((r) => r.max_tokens === 700) && requests.find((r) => r.model.includes("sonnet")).max_tokens === 1200);
  check("calls use the cleaning app's own key", requests.every((r) => r.key === "sk-fake-e2e-board"));
  check("every call is told the goals, hours, capital and willingness to hire", requests.every((r) => /\$10k a month/.test(r.system) && /\$50k a month in profit/.test(r.system) && /10 to 15 hours/.test(r.system) && /\$5k/.test(r.system) && /willing to hire/.test(r.system)));
  check("the synthesis is asked for exactly 3 prioritized actions for the next 7 days", /exactly 3 prioritized actions for the next 7 days/.test(requests.find((r) => r.model.includes("sonnet")).system));
  const usage = await usageRows();
  check("usage is metered under feature board for the signed-in person", usage.length === 4 && usage.every((u) => u.status === "settled" && u.actor_type === "user"), JSON.stringify(usage.map((u) => [u.status, u.actor_type])));
  const row = (await db.from("board_sessions").select("*").eq("created_by", owner.id).single()).data;
  check("the session is saved with its cost, matching what was metered", row.status === "done" && row.cost_micros === usage.reduce((n, u) => n + u.cost_micros, 0) && row.cost_micros > 0 && row.est_micros >= row.cost_micros, JSON.stringify({ c: row.cost_micros, e: row.est_micros }));

  // ============================================================ repeat within 24 hours
  await op.goto(`${base}/board`, { waitUntil: "networkidle" });
  check("the past sessions list shows it", (await op.getByTestId("board-session-link").count()) >= 1);
  const before = requests.length;
  await runAndWait(op, q1);
  check("the same question again reuses the saved session at no cost", op.url() === sessionUrl && requests.length === before && (await usageRows()).length === 4 && (await sessionCount()) === 1);

  // ============================================================ log decision
  await op.getByRole("radio", { name: /Action 2:/ }).check();
  await op.getByTestId("board-log").click();
  await op.getByText("Logged", { exact: true }).waitFor({ timeout: 15000 });
  const dec = (await db.from("growth_decisions").select("*").eq("created_by", owner.id)).data ?? [];
  check("Log decision writes the chosen action and the verdict to the decision log", dec.length === 1 && dec[0].decision === SYN.actions[1].title && dec[0].note.includes(SYN.verdict) && dec[0].note.startsWith("Roast Room (AI advisors, not real people)") && dec[0].kind === "general", JSON.stringify(dec));
  check("the session is linked to it and the button is gone", (await db.from("board_sessions").select("logged_decision_id").eq("id", row.id).single()).data.logged_decision_id === dec[0].id && (await op.getByTestId("board-log").count()) === 0);
  await op.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("the Go/No-go decision log on /growth shows it", (await op.getByText(SYN.actions[1].title).count()) >= 1);
  await op.goto(sessionUrl, { waitUntil: "networkidle" });
  check("reopening the session still shows it as logged", (await op.getByText("Logged", { exact: true }).count()) === 1);

  // ============================================================ two rounds with the snapshot
  requests.length = 0;
  await op.goto(`${base}/board`, { waitUntil: "networkidle" });
  await op.getByRole("checkbox", { name: "Include a snapshot of my business numbers" }).click();
  await op.getByLabel("Rounds").click();
  await op.getByRole("option", { name: /2 rounds/ }).click();
  await runAndWait(op, `e2e ${tag}-b: Is it time to raise prices on recurring residential cleans? Our margin is thin.`);
  check("two rounds: six advisor calls and one synthesis", requests.length === 7 && requests.filter((r) => r.model.includes("haiku")).length === 6, requests.length);
  check("round 2 shows each advisor the others' answers", requests.filter((r) => r.user.includes("Round 2")).length === 3);
  check("the page shows both rounds", (await op.getByTestId("board-round").count()) === 2 && (await op.getByTestId("board-advisor-card").count()) === 6);
  check("the snapshot reached the advisors as numbers", requests.every((r) => /Snapshot as of/.test(r.user)) && requests.some((r) => /Cash on hand/.test(r.user)));
  const everything = requests.map((r) => `${r.system}\n${r.user}`).join("\n");
  const leaks = [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i, /\b\d{3}[-.\s)]*\d{3}[-.\s]*\d{4}\b/, /sk-/, /eyJ[A-Za-z0-9_-]{10,}/, /service_role/i, /Bearer /i].filter((re) => re.test(everything));
  check("nothing sent to the model holds an email, phone number or key", leaks.length === 0, leaks.join(","));
  const cost2 = (await db.from("board_sessions").select("cost_micros, est_micros, rounds, use_context").eq("created_by", owner.id).order("created_at", { ascending: false }).limit(1).single()).data;
  check("the two-round session is saved with its snapshot flag and a cost under its estimate", cost2.rounds === 2 && cost2.use_context === true && cost2.cost_micros > 0 && cost2.cost_micros <= cost2.est_micros, JSON.stringify(cost2));

  // ============================================================ kill switch and cap
  const countBefore = await sessionCount();
  const reqBefore = requests.length;
  await db.from("ai_settings").update({ kill_switch: true }).eq("id", true);
  await op.goto(`${base}/board`, { waitUntil: "networkidle" });
  await op.getByLabel("Your business question or decision").fill(`e2e ${tag}-c: Should I add a second residential cleaner this month?`);
  await op.getByTestId("board-run").click();
  await op.getByText(/AI is switched off/).first().waitFor({ timeout: 20000 });
  check("with the kill switch on, the run is refused with a plain message", /\/board$/.test(op.url()));
  check("nothing was sent and nothing was saved", requests.length === reqBefore && (await sessionCount()) === countBefore);
  await db.from("ai_settings").update({ kill_switch: false }).eq("id", true);

  const board = budgetsBefore.find((b) => b.scope === "feature" && b.scope_key === "board");
  await db.from("ai_budgets").update({ daily_cap_cents: 1, monthly_cap_cents: Math.max(1, board?.monthly_cap_cents ?? 1000), hard_stop: true }).eq("scope", "feature").eq("scope_key", "board");
  await op.getByTestId("board-run").click();
  await op.getByText(/budget .* has been reached/i).first().waitFor({ timeout: 20000 });
  check("a spent board cap refuses the run and names the budget", /\/board$/.test(op.url()));
  check("still nothing sent or saved", requests.length === reqBefore && (await sessionCount()) === countBefore);
  await db.from("ai_budgets").update({ daily_cap_cents: board?.daily_cap_cents ?? null, monthly_cap_cents: board?.monthly_cap_cents ?? null, hard_stop: board?.hard_stop ?? true }).eq("scope", "feature").eq("scope_key", "board");

  // delete
  await op.goto(sessionUrl, { waitUntil: "networkidle" });
  await op.getByTestId("board-delete").click();
  await op.waitForURL(/\/board$/, { timeout: 15000 });
  check("a session can be deleted", (await db.from("board_sessions").select("id").eq("id", row.id)).data.length === 0);

  // ============================================================ who may use it
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ap = await signIn(actx, admin, /command-center/);
  await ap.goto(`${base}/board`, { waitUntil: "networkidle" });
  check("an admin can open the Roast Room", /\/board$/.test(ap.url()) && (await ap.locator("h1").innerText()) === "Roast Room");
  await actx.close();
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await signIn(sctx, staff, /command-center|leads|schedule/);
  await sp.goto(`${base}/board`, { waitUntil: "networkidle" });
  check("staff are sent away from /board", !/\/board/.test(sp.url()));
  check("staff have no Roast Room link", (await sp.getByRole("link", { name: "Roast Room" }).count()) === 0);
  await sctx.close();
  const anonKey = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const signed = await anonKey.auth.signInWithPassword({ email: staff.email, password });
  check("staff can sign in to the API", !signed.error);
  const staffRead = await anonKey.from("board_sessions").select("id");
  check("staff read no sessions through the API", !staffRead.error && (staffRead.data?.length ?? 0) === 0);
  const staffWrite = await anonKey.rpc("save_board_session", { p_question: "x".repeat(20), p_advisors: ["cash_ruin"], p_rounds: 1, p_use_context: false, p_input_hash: "a".repeat(64), p_status: "done", p_advisor_outputs: [], p_synthesis: null, p_est_micros: 0, p_cost_micros: 0 });
  check("staff cannot save a session through the API", Boolean(staffWrite.error));
  const lonely = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  check("a signed-out visitor reads nothing", ((await lonely.from("board_sessions").select("id")).data ?? []).length === 0);

  // ============================================================ every direction x theme, desktop and phone
  // One finished session to look at.
  const keep = await (async () => {
    await op.goto(`${base}/board`, { waitUntil: "networkidle" });
    await runAndWait(op, `e2e ${tag}-d: Should I buy a van for supplies or keep using rideshares for the team?`);
    return op.url();
  })();
  await octx.close();
  const prefs = [];
  for (const direction of ["titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });
  for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
    for (const p of prefs) {
      await db.from("user_preferences").upsert({ user_id: owner.id, direction: p.direction, theme: p.theme });
      const page = ctx.pages()[0] ?? (await signIn(ctx, owner, /command-center/));
      for (const [path, kind] of [["/board", "form"], [new URL(keep).pathname, "session"]]) {
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        const attrs = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
        const bad = (await overflow(page)) ? "overflow" : attrs.d !== p.direction || attrs.dark !== (p.theme === "dark") ? `wrong theme ${JSON.stringify(attrs)}` : (await page.locator("h1").count()) < 1 ? "no heading" : kind === "form" && (await page.getByTestId("board-form").count()) !== 1 ? "no form" : kind === "session" && (await page.getByTestId("board-synthesis").count()) !== 1 ? "no synthesis" : "";
        check(`/board ${kind} ${label} ${p.direction} ${p.theme}`, bad === "", bad);
        if (process.env.E2E_SHOTS_DIR) await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/board-${kind}-${label}-${p.direction}-${p.theme}.png`, fullPage: true });
      }
    }
    await ctx.close();
  }
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
