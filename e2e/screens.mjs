/**
 * Every-screen audit. Creates and deletes its own temporary owner and cleaner (cleaning project only) and visits each
 * screen in all 9 directions x dark/light at 1440px and 390px, checking: the page rendered (no error page), the right
 * direction and theme, no horizontal overflow, text contrast (4.5:1 office, 7:1 crew screens), and layout shift (CLS).
 *
 *   npm run build
 *   npm run e2e:screens          (E2E_SHOTS_DIR=/some/dir saves screenshots of Vault)
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { contrastInPage } from "./lib/contrast.mjs";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3161;
const base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = [];
let subId = null;
const shots = process.env.E2E_SHOTS_DIR;
const only = process.env.SCREENS_ONLY?.split(",");

async function cleanup() {
  for (const u of users) {
    await db.from("user_preferences").delete().eq("user_id", u.id);
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
  if (subId) await db.from("subcontractors").delete().eq("id", subId);
}
await cleanup();
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXT_PUBLIC_APP_URL: base }, stdio: "ignore" });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

const OFFICE = ["/leads", "/schedule", "/invoices", "/payouts", "/settings", "/settings/integrations", "/settings/ai-usage", "/board", "/board/preview", "/growth/settings", "/automations", "/marketing", "/crews"];
const CREW = ["/my-jobs", "/my-jobs/pay", "/settings"];
const PUBLIC = ["/login", "/lead-form"];

let browser = null;
const errors = [];
try {
  const password = randomBytes(18).toString("base64url");
  const make = async (role, extra = {}) => {
    const email = `seed+e2escreens-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    const { error: pe } = await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true, ...extra });
    if (pe) throw pe;
    return { id: data.user.id, email };
  };
  const owner = await make("owner");
  const { data: sub, error: se } = await db.from("subcontractors").insert({ display_name: "E2E Screens Cleaner", pay_rate_bps: 4000, status: "active" }).select("id").single();
  if (se) throw se;
  subId = sub.id;
  const cleaner = await make("subcontractor", { subcontractor_id: subId });

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const prefs = [];
  for (const direction of ["glass-cyan-dark", "glass-ice-light", "glass-titanium", "glass-midnight-violet", "glass-emerald", "vault", "titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });

  const visit = async (page, path, p, label, minNormal, tag) => {
    const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await sleep(1400);
    const a = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
    const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    const c = await page.evaluate(contrastInPage, minNormal);
    const cls = await page.evaluate(() => window.__cls ?? 0);
    const crashed = await page.evaluate(() => /Application error|Internal Server Error|This page couldn.t load/i.test(document.body.innerText));
    const bad =
      res && res.status() >= 500 ? `status ${res.status()}`
      : crashed ? "error page"
      : over ? "overflow"
      : a.d !== p.direction || a.dark !== (p.theme === "dark") ? `wrong theme ${JSON.stringify(a)}`
      : cls > 0.1 ? `layout shift ${cls.toFixed(3)}`
      : c.bad.length ? `contrast: ${c.bad.slice(0, 4).join("; ")}`
      : "";
    check(`${tag} ${path} ${label} ${p.direction} ${p.theme}`, bad === "", bad);
    if (shots && p.direction === "vault") {
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      const vp = page.viewportSize();
      await page.setViewportSize({ width: vp.width, height: Math.min(full, 3200) });
      await sleep(600);
      await page.screenshot({ path: `${shots}/${tag}${path.replace(/\//g, "-")}-${p.theme}-${label}.png` });
      await page.setViewportSize(vp);
    }
  };

  for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    const mobile = width < 500;
    // signed-in roles: preferences live in the database
    for (const [who, paths, minNormal, tag] of [[owner, OFFICE, 4.5, "office"], [cleaner, CREW, 7, "crew"]]) {
      if (only && !only.includes(tag)) continue;
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
      await ctx.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
      await page.goto(`${base}/login`, { waitUntil: "networkidle" });
      await page.fill("#email", who.email);
      await page.fill("#password", password);
      await page.click('button[type="submit"]');
      await page.waitForURL(/command-center|my-jobs/, { timeout: 25000 });
      for (const p of prefs) {
        await db.from("user_preferences").upsert({ user_id: who.id, direction: p.direction, theme: p.theme });
        for (const path of paths) await visit(page, path, p, label, minNormal, tag);
      }
      await ctx.close();
    }
    // signed-out pages: direction cookie + saved theme
    if (!only || only.includes("public")) for (const p of prefs) {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
      await ctx.addCookies([{ name: "kc-direction", value: p.direction, url: base }]);
      await ctx.addInitScript(([d, t]) => {
        localStorage.setItem("kc:direction", d);
        localStorage.setItem("theme", t);
        window.__cls = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      }, [p.direction, p.theme]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
      for (const path of PUBLIC) await visit(page, path, p, label, 4.5, "public");
      await ctx.close();
    }
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
