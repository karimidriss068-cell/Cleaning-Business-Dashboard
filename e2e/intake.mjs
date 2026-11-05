/**
 * Public lead form end-to-end test. Needs no logins: it starts a FAKE Turnstile on this machine and
 * the built app pointed at it, and talks to the cleaning project's database with the service role
 * (the script refuses any other project).
 *
 *   npm run build
 *   npm run e2e:intake
 *
 * Part A (HTTP): no sign-in needed, a good submission, the stored consent record (date, source,
 * server-held wording), a duplicate (same answer, no second contact or lead), missing consent, bad
 * input, the hidden trap, Turnstile, both rate limits, headers for embedding, and no secrets in the page.
 * Part B (browser): inline errors, the thank-you state with the reply promise, the form embedded in a
 * host page through embed.js (campaign tags and page address captured), and every direction x theme at
 * 1440px and 390px. Everything it adds is removed.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3152;
const TS_PORT = 3191;
const HOST_PORT = 3192;
const base = `http://localhost:${PORT}`;
const SALT = randomBytes(24).toString("hex");
const TS_SECRET = `ts-secret-${randomBytes(12).toString("hex")}`;
const CAMPAIGN = "E2E-Intake campaign";
const SHOTS = process.env.E2E_SHOTS_DIR; // optional: where to save screenshots
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = new Date().toISOString();
const PHONE_PREFIX = "+1332555020"; // +13325550200 .. +13325550209
const phone = (i) => `(332) 555-020${i}`;
const e164 = (i) => `${PHONE_PREFIX}${i}`;
const PHONES = Array.from({ length: 10 }, (_, i) => e164(i));
const EMAIL_LIKE = "e2e-intake-%@example.com";

// ------------------------------------------------------------------ a fake Turnstile
const tsCalls = [];
const fakeTs = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const form = new URLSearchParams(raw);
    tsCalls.push({ secret: form.get("secret"), response: form.get("response") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: form.get("secret") === TS_SECRET && form.get("response") === "good-token" }));
  });
});
await new Promise((r) => fakeTs.listen(TS_PORT, "127.0.0.1", r));

// ------------------------------------------------------------------ a host page that embeds the form
const host = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;font-family:sans-serif"><h1>Host site</h1><script src="${base}/embed.js"></script></body></html>`);
});
await new Promise((r) => host.listen(HOST_PORT, "127.0.0.1", r));

function runSql(sql) {
  const dir = mkdtempSync(join(tmpdir(), "e2e-intake-"));
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

async function cleanup() {
  const phones = PHONES.map((p) => `'${p}'`).join(",");
  runSql(`begin;
delete from public.opt_outs where value in (${phones}) and value not in (select phone from public.contacts where phone is not null and source is distinct from 'other');
delete from public.leads where contact_id in (select id from public.contacts where phone in (${phones}) or email like '${EMAIL_LIKE}');
delete from public.contacts where phone in (${phones}) or email like '${EMAIL_LIKE}';
delete from public.marketing_campaigns where name = '${CAMPAIGN}';
delete from public.intake_hits where created_at >= '${t0}';
commit;`);
}
await cleanup(); // leftovers of an aborted run
const { data: taken } = await db.from("contacts").select("id").or(`phone.in.(${PHONES.join(",")}),email.like.${EMAIL_LIKE}`);
if (taken?.length) throw new Error("refusing: a test phone number or email already belongs to a real or demo contact");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env: {
    ...process.env, NEXT_PUBLIC_APP_URL: base, INTAKE_IP_SALT: SALT, TURNSTILE_SECRET_KEY: TS_SECRET,
    TURNSTILE_VERIFY_URL: `http://127.0.0.1:${TS_PORT}/siteverify`, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-site-key",
  },
  stdio: "ignore",
});
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

let ipn = 0;
const newIp = () => `203.0.113.${(ipn = ipn + 1)}`;
const good = (i, over = {}) => ({
  name: "E2E Intake", phone: phone(i), email: undefined, borough: "queens", serviceType: "residential",
  consent: true, consentVersion: undefined, elapsedMs: 5000, turnstileToken: "good-token", utm: {}, ...over,
});
const consentVersion = readFileSync("src/lib/intake.ts", "utf8").match(/CONSENT_VERSION = "([^"]+)"/)[1];
const post = (body, ip = newIp(), headers = {}) =>
  fetch(`${base}/api/public/leads`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/json", "x-real-ip": ip, ...headers },
    body: typeof body === "string" ? body : JSON.stringify({ ...body, consentVersion: body.consent ? consentVersion : body.consentVersion }),
  });
const contactBy = async (p) => (await db.from("contacts").select("*").eq("phone", p).maybeSingle()).data;
const leadsOf = async (cid) => (await db.from("leads").select("*").eq("contact_id", cid)).data ?? [];

let browser = null;
const errors = [];
try {
  const html = await (await fetch(`${base}/lead-form`)).text();
  const stale = await fetch(`${base}/api/public/leads`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": newIp() }, body: JSON.stringify({ ...good(4), consentVersion: "old-wording" }) });
  check("consent given against a wording the server doesn't hold is refused", stale.status === 400 && !(await contactBy(e164(4))));

  // ============================================================ Part A: HTTP
  const open = await fetch(`${base}/api/public/leads`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json" }, body: "{}" });
  check("the endpoint is reachable without signing in (not sent to /login)", open.status !== 307 && open.status !== 308 && open.status === 400, open.status);
  const pageRes = await fetch(`${base}/lead-form`, { redirect: "manual" });
  check("the form page is public and framable by any site", pageRes.status === 200 && /frame-ancestors \*/.test(pageRes.headers.get("content-security-policy") ?? ""), pageRes.headers.get("content-security-policy"));
  const emb = await fetch(`${base}/embed.js`, { redirect: "manual" });
  check("embed.js is public JavaScript", emb.status === 200 && /javascript/.test(emb.headers.get("content-type") ?? "") && /kc-lead-form-height/.test(await emb.text()));
  check("the page holds no secrets", ![TS_SECRET, SALT, process.env.SUPABASE_SERVICE_ROLE_KEY].some((s) => html.includes(s)) && !/service_role/i.test(html));
  check("the page carries the public site key only", html.includes("e2e-site-key"));

  // -- a good submission with campaign tags
  await db.from("marketing_campaigns").insert({ platform: "google", channel: "google_search", name: CAMPAIGN, status: "active", start_date: new Date().toISOString().slice(0, 10) });
  const r1 = await post(good(1, { name: "Maria Del Rio", email: "E2E-Intake-A@Example.com", page: "https://example.com/clean?x=1", utm: { source: "google", medium: "cpc", campaign: CAMPAIGN, content: "Ad A" } }));
  const j1 = await r1.json();
  check("good submission: 200 with a reply promise", r1.status === 200 && j1.ok === true && /reach out/.test(j1.message), JSON.stringify(j1));
  const c1 = await contactBy(e164(1));
  check("contact stored: name split, phone E.164, email lowercase, borough", c1?.first_name === "Maria" && c1?.last_name === "Del Rio" && c1?.email === "e2e-intake-a@example.com" && c1?.borough === "queens", JSON.stringify(c1));
  const l1 = c1 ? await leadsOf(c1.id) : [];
  check("one new lead from google with the campaign, channel and creative from the tags", l1.length === 1 && l1[0].stage === "new" && l1[0].source === "google" && l1[0].campaign_id !== null && l1[0].channel === "google_search" && l1[0].creative === "Ad A", JSON.stringify(l1[0]));
  check("campaign tags kept on the contact", c1?.utm_source === "google" && c1?.utm_medium === "cpc" && c1?.utm_campaign === CAMPAIGN);
  const { data: acts } = await db.from("activities").select("type, subject, body").eq("lead_id", l1[0]?.id ?? "00000000-0000-0000-0000-000000000000");
  check("timeline has 'Lead created' and a call-now task naming the page", acts?.some((a) => a.subject === "Lead created") && acts?.some((a) => a.type === "call" && /example\.com\/clean/.test(a.body ?? "")), JSON.stringify(acts));
  const { data: recs } = await db.from("consent_records").select("*").eq("contact_id", c1?.id ?? "00000000-0000-0000-0000-000000000000");
  check("consent evidence: date, source, wording shown, version, hashed address", recs?.length === 1 && recs[0].source === "web_form" && recs[0].applied === true && /Reply STOP/.test(recs[0].wording) && recs[0].wording_version === consentVersion && Math.abs(Date.now() - new Date(recs[0].granted_at).getTime()) < 120_000 && /^[0-9a-f]{64}$/.test(recs[0].ip_hash ?? ""), JSON.stringify(recs?.[0]));
  check("no raw address in the consent record", !JSON.stringify(recs).includes("203.0.113"));
  check("texting switched on for the new contact, sourced from the web form", c1?.sms_consent === true && c1?.sms_consent_source === "web_form");

  // -- duplicate: same person, same answer, nothing doubled
  const r1b = await post(good(1, { name: "Maria D", serviceType: "recurring" }));
  const j1b = await r1b.json();
  check("duplicate: same 200 answer as a new lead", r1b.status === 200 && JSON.stringify(j1b) === JSON.stringify(j1));
  const { data: samePhone } = await db.from("contacts").select("id").eq("phone", e164(1));
  check("duplicate: still one contact and one open lead", samePhone?.length === 1 && (await leadsOf(c1.id)).length === 1);
  const { data: acts2 } = await db.from("activities").select("subject").eq("lead_id", l1[0].id);
  check("duplicate: the timeline notes the second submission", acts2?.some((a) => a.subject === "Sent the website form again"));
  const r1c = await post(good(2, { name: "Maria", phone: undefined, email: "e2e-intake-a@example.com", consent: false }));
  check("duplicate by email matches too", r1c.status === 200 && (await db.from("contacts").select("id").eq("email", "e2e-intake-a@example.com")).data?.length === 1);
  const { data: recs2 } = await db.from("consent_records").select("applied").eq("contact_id", c1.id);
  check("duplicate with consent: evidence kept, flag for the existing contact untouched", recs2?.length === 2 && recs2.filter((r) => !r.applied).length === 1);

  // -- missing consent
  const r2 = await post(good(3, { consent: false }));
  const c3 = await contactBy(e164(3));
  check("no consent: lead still created", r2.status === 200 && c3 && (await leadsOf(c3.id)).length === 1);
  check("no consent: texting stays off and no record is written", c3?.sms_consent === false && ((await db.from("consent_records").select("id").eq("contact_id", c3.id)).data?.length ?? 0) === 0);
  const rNoPhone = await post(good(3, { phone: undefined, email: "x@example.com" }));
  check("consent ticked with no phone: 400, nothing stored", rNoPhone.status === 400 && (await db.from("contacts").select("id").eq("email", "x@example.com")).data?.length === 0);

  // -- bad input
  for (const [label, body] of [
    ["not JSON", "{nope"], ["empty object", {}], ["blank name", good(4, { name: " " })], ["bad phone", good(4, { phone: "12" })],
    ["bad email", good(4, { phone: undefined, email: "nope", consent: false })], ["unknown borough", good(4, { borough: "mars" })],
    ["unknown service", good(4, { serviceType: "x" })], ["unknown field", good(4, { admin: true })], ["link as name", good(4, { name: "see http://spam.example" })],
    ["huge body", good(4, { name: "x".repeat(20000) })],
  ]) {
    const r = await post(body);
    check(`bad input (${label}): 4xx, nothing stored`, r.status >= 400 && r.status < 500 && !(await contactBy(e164(4))), r.status);
  }
  const wrongType = await fetch(`${base}/api/public/leads`, { method: "POST", headers: { "content-type": "text/plain", "x-real-ip": newIp() }, body: JSON.stringify(good(4)) });
  check("wrong content type: 400", wrongType.status === 400);
  const fieldMsg = await (await post(good(4, { phone: "12" }))).json();
  check("errors name the field for the form to show", fieldMsg.error === "invalid" && Array.isArray(fieldMsg.fields?.phone), JSON.stringify(fieldMsg));

  // -- bot protection
  const trap = await post(good(5, { website: "http://spam.example" }));
  check("hidden field filled: looks like success, nothing stored", trap.status === 200 && (await trap.json()).ok === true && !(await contactBy(e164(5))));
  const fast = await post(good(5, { elapsedMs: 100 }));
  check("instant submit: looks like success, nothing stored", fast.status === 200 && !(await contactBy(e164(5))));
  tsCalls.length = 0;
  const noTok = await post(good(5, { turnstileToken: undefined }));
  check("no Turnstile token: 403, nothing stored", noTok.status === 403 && !(await contactBy(e164(5))));
  const badTok = await post(good(5, { turnstileToken: "forged" }));
  check("forged Turnstile token: 403, nothing stored", badTok.status === 403 && !(await contactBy(e164(5))));
  check("the real secret was sent to Turnstile from the server", tsCalls.some((c) => c.secret === TS_SECRET && c.response === "forged"));

  // -- rate limits
  const ip = newIp();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await post(good(6, { name: `Rate ${i}`, phone: undefined, email: `e2e-intake-rate-${i}@example.com`, consent: false }), ip)).status);
  check("same address: allowed up to 6, then 429", codes.slice(0, 3).every((c) => c === 200) && codes[6] === 429, codes.join(","));
  const limited = await post(good(7), ip);
  check("429 carries Retry-After and stores nothing", limited.status === 429 && Number(limited.headers.get("retry-after")) > 0 && !(await contactBy(e164(7))));
  check("another address is not affected", (await post(good(7, { consent: false }))).status === 200);
  const pcodes = [];
  for (let i = 0; i < 4; i++) pcodes.push((await post(good(8, { consent: false }))).status);
  check("same person from new addresses: 3 then 429", pcodes.join(",") === "200,200,200,429", pcodes.join(","));

  // ============================================================ Part B: browser
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  const stub = (ctx) => ctx.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: `window.turnstile={render:function(el,o){setTimeout(function(){o.callback("good-token")},50);return "w1"},reset:function(){}};` }));
  const newCtx = async (width, height, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500, extraHTTPHeaders: { "x-real-ip": newIp() }, ...extra });
    await stub(ctx);
    return ctx;
  };
  const watch = (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  };
  const fillForm = async (scope, i, { consent = true, name = "Browser Tester" } = {}) => {
    await scope.getByLabel("Your name").fill(name);
    await scope.getByLabel("Mobile phone").fill(phone(i));
    await scope.getByTestId("borough").click();
    await scope.getByRole("option", { name: "Brooklyn" }).click();
    if (consent) await scope.getByTestId("consent").click();
  };

  // inline errors, then a real submission at phone width
  {
    const ctx = await newCtx(390, 844);
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`${base}/lead-form?utm_source=instagram&utm_campaign=spring&page=${encodeURIComponent("https://example.com/landing")}`, { waitUntil: "networkidle" });
    await page.getByTestId("submit").click();
    check("empty submit shows inline errors and sends nothing", (await page.getByRole("alert").count()) >= 2 && !(await page.getByTestId("thank-you").count()));
    await page.getByLabel("Your name").fill("Browser Tester");
    await page.getByLabel("Mobile phone").fill("12");
    await page.getByTestId("submit").click();
    check("bad phone is explained next to the field", (await page.getByText("That isn't a valid US phone number").count()) === 1);
    await fillForm(page, 0);
    await page.waitForTimeout(1600);
    await page.getByTestId("submit").click();
    await page.getByTestId("thank-you").waitFor({ timeout: 15000 });
    const promise = await page.getByTestId("reply-promise").innerText();
    check("thank-you state says when to expect a reply", /(within 15 minutes|by 8am)/.test(promise), promise);
    check("thank-you takes focus and replaces the form", (await page.getByTestId("submit").count()) === 0 && (await page.evaluate(() => document.activeElement?.tagName)) === "H2");
    const c0 = await contactBy(e164(0));
    const l0 = c0 ? await leadsOf(c0.id) : [];
    check("browser lead: tags and landing page captured, consent recorded", c0?.utm_source === "instagram" && c0?.utm_campaign === "spring" && l0[0]?.source === "instagram" && c0?.sms_consent === true, JSON.stringify(c0));
    const { data: a0 } = await db.from("activities").select("body").eq("lead_id", l0[0]?.id ?? "00000000-0000-0000-0000-000000000000").eq("type", "call");
    check("browser lead: the landing page is in the call-now task", a0?.some((a) => /example\.com\/landing/.test(a.body ?? "")), JSON.stringify(a0));
    await ctx.close();
  }

  // embedded in a host page
  {
    const ctx = await newCtx(900, 900);
    const page = await ctx.newPage();
    watch(page);
    await page.goto(`http://127.0.0.1:${HOST_PORT}/?utm_source=google&utm_medium=cpc&utm_campaign=${encodeURIComponent(CAMPAIGN)}`, { waitUntil: "networkidle" });
    const frame = page.frameLocator("iframe[title='Get a cleaning quote']");
    await frame.getByLabel("Your name").waitFor({ timeout: 15000 });
    const h = await page.locator("iframe").evaluate((f) => f.getBoundingClientRect().height);
    check("embedded: the frame is sized to the form (no inner scroll)", h > 300 && h < 1400, h);
    await fillForm(frame, 9, { name: "Embedded Tester" });
    await page.waitForTimeout(1600);
    await frame.getByTestId("submit").click();
    await frame.getByTestId("thank-you").waitFor({ timeout: 15000 });
    const c9 = await contactBy(e164(9));
    const l9 = c9 ? await leadsOf(c9.id) : [];
    check("embedded: the host page's campaign tags attribute the lead", c9?.utm_source === "google" && c9?.utm_medium === "cpc" && l9[0]?.campaign_id !== null && l9[0]?.channel === "google_search", JSON.stringify({ u: c9?.utm_source, ch: l9[0]?.channel }));
    const { data: a9 } = await db.from("activities").select("body").eq("lead_id", l9[0]?.id ?? "00000000-0000-0000-0000-000000000000").eq("type", "call");
    check("embedded: the host page address is recorded", a9?.some((a) => a.body?.includes(`127.0.0.1:${HOST_PORT}`)), JSON.stringify(a9));
    await ctx.close();
  }

  // every direction x theme, desktop and phone
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    for (const direction of ["titanium", "ocean", "midnight"]) {
      for (const theme of ["dark", "light"]) {
        const ctx = await newCtx(width, height);
        await ctx.addCookies([{ name: "kc-direction", value: direction, url: base }]);
        await ctx.addInitScript((t) => { try { localStorage.setItem("theme", t); } catch {} }, theme);
        const page = await ctx.newPage();
        watch(page);
        for (const state of ["form", "errors", "thanks"]) {
          if (state === "form") await page.goto(`${base}/lead-form`, { waitUntil: "networkidle" });
          if (state === "errors") { await page.getByTestId("submit").click(); await page.getByRole("alert").first().waitFor(); }
          if (state === "thanks") {
            await page.reload({ waitUntil: "networkidle" });
            await page.evaluate(() => {});
            await page.route("**/api/public/leads", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, message: "We'll reach out within 15 minutes." }) }));
            await fillForm(page, 0, { name: "Theme Check" });
            await page.waitForTimeout(1600);
            await page.getByTestId("submit").click();
            await page.getByTestId("thank-you").waitFor({ timeout: 15000 });
          }
          const attrs = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
          const bad = (await overflow(page)) ? "overflow" : attrs.d !== direction || attrs.dark !== (theme === "dark") ? `wrong theme ${JSON.stringify(attrs)}` : state !== "thanks" && (await page.locator("h1").count()) < 1 ? "no heading" : "";
          check(`lead form ${state} ${label} ${direction} ${theme}`, bad === "", bad);
          if (SHOTS) await page.waitForTimeout(600); // let the enter animation settle
          if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-${direction}-${theme}-${state}.png`), fullPage: true });
        }
        await ctx.close();
      }
    }
  }
} finally {
  await browser?.close();
  server.kill();
  fakeTs.close();
  host.close();
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify(failed, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
