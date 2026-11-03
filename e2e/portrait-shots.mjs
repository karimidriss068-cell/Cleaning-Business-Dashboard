import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: not cleaning project");
const PORT = 3159, base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = [];
const cleanup = async () => { for (const u of users) { await db.from("user_preferences").delete().eq("user_id", u.id); await db.from("profiles").delete().eq("user_id", u.id); await db.auth.admin.deleteUser(u.id); } };
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXT_PUBLIC_APP_URL: base }, stdio: "ignore" });
for (let i = 0; i < 60; i++) { if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break; await sleep(1000); }
let browser;
try {
  const password = randomBytes(18).toString("base64url");
  const email = `seed+e2eportrait-owner-${randomBytes(3).toString("hex")}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  users.push(data.user);
  await db.from("profiles").insert({ user_id: data.user.id, role: "owner", full_name: "E2E owner", is_active: true });
  await db.from("user_preferences").upsert({ user_id: data.user.id, direction: "titanium", theme: "dark" });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email); await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/command-center/, { timeout: 25000 });
  for (const [s, m] of [["a","opening"],["a","debate"],["a","verdict"],["b","debate"],["c","debate"]]) {
    await page.goto(`${base}/board/preview?style=${s}&moment=${m}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="boardroom"]');
    await page.waitForFunction(() => document.querySelectorAll('img[src*="/board/portraits/"]').length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    const info = await page.evaluate(() => { const im = [...document.querySelectorAll('img[src*="/board/portraits/"]')]; return { n: im.length, loaded: im.filter((i) => i.complete && i.naturalWidth > 0).length, dir: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }; });
    await page.screenshot({ path: `.shots-portraits/${s}-${m}.png` });
    console.log(s, m, JSON.stringify(info));
  }
} finally { await browser?.close(); server.kill(); await cleanup(); }
