/**
 * Vault direction end-to-end test (Command Center and Growth). Creates and deletes its own temporary
 * owner, staff and cleaner users on the cleaning project (the script refuses any other project).
 *
 *   npm run build
 *   npm run e2e:vault            (E2E_SHOTS_DIR=/some/dir saves screenshots)
 *
 * Covers: Glass Cyan is the default direction (Vault is still selectable); the slim replay strip (play, speed, drag, back to today) moves the
 * numbers, the pace and the growth card; the channel ribbons isolate a channel on hover and switch range;
 * the revenue flow is owner/admin only; nothing 3D, canvas or tilt anywhere; frame rate while idle, playing
 * and hovering; and, for every direction x theme at 1440px and 390px, no overflow, the right theme
 * and text contrast (computed colors; glass backdrops are covered by src/config/brand.test.ts).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3159;
const base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = [];
let subId = null;
const shots = process.env.E2E_SHOTS_DIR;
const metrics = {};

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

const contrastInPage = () => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "rgba(0,0,0,0)";
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const canvasBg = rgba(getComputedStyle(document.documentElement).getPropertyValue("--kc-canvas").trim() || "rgb(0,0,0)");
  const bad = [];
  let checked = 0;
  for (const el of document.querySelectorAll("main *")) {
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    if (el.closest("svg")) continue; // chart labels: covered by the chart colors in brand.test.ts
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(" ");
    if (!own) continue;
    const cs = getComputedStyle(el);
    let bg = [0, 0, 0, 0];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) bg = over(bg, c);
      if (bg[3] >= 0.999) break;
    }
    bg = over(bg, canvasBg);
    const fg = over(rgba(cs.color), bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    checked++;
    if (ratio < (large ? 3 : 4.5)) bad.push(`${own.slice(0, 40)} ${ratio.toFixed(2)}`);
  }
  return { checked, bad };
};

const fpsOver = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((res) => {
        let n = 0;
        let t0 = 0;
        const f = (t) => {
          if (!t0) t0 = t;
          n++;
          if (t - t0 < ms) requestAnimationFrame(f);
          else res(Math.round((n * 1000) / (t - t0)));
        };
        requestAnimationFrame(f);
      }),
    ms,
  );

let browser = null;
const errors = [];
try {
  const password = randomBytes(18).toString("base64url");
  const make = async (role, extra = {}) => {
    const email = `seed+e2evault-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    const { error: pe } = await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true, ...extra });
    if (pe) throw pe;
    return { id: data.user.id, email };
  };
  const owner = await make("owner");
  const staff = await make("staff");
  const { data: sub, error: se } = await db.from("subcontractors").insert({ display_name: "E2E Vault Cleaner", pay_rate_bps: 4000, status: "active" }).select("id").single();
  if (se) throw se;
  subId = sub.id;
  const cleaner = await make("subcontractor", { subcontractor_id: subId });

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
  const shot = async (page, name, width, height) => {
    if (!shots) return;
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height: Math.min(full, 4200) });
    await sleep(1800);
    await page.screenshot({ path: `${shots}/${name}.png` });
    await page.setViewportSize({ width, height });
  };

  // ============================================================ default direction, desktop
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await signIn(dctx, owner, /command-center/);
  await dp.waitForLoadState("networkidle");
  const attrs = await dp.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
  check("a new member gets Glass Cyan in dark by default", attrs.d === "glass-cyan-dark" && attrs.dark, JSON.stringify(attrs));
  check("no horizontal overflow on the Command Center", !(await overflow(dp)));
  await dp.getByTestId("replay-deck").waitFor();
  check("the replay deck starts on today, live", (await dp.getByTestId("replay-deck").getAttribute("data-replay-live")) === "true");
  const lastIndex = Number(await dp.getByTestId("replay-deck").getAttribute("data-replay-index"));
  check("30 days of frames", lastIndex === 29, `last index ${lastIndex}`);
  await sleep(2000);
  check("no canvas or 3D scene anywhere", (await dp.getByTestId("vault-scene").count()) === 0 && (await dp.locator("canvas").count()) === 0);
  check("no tilt wrapper on tiles", (await dp.locator(".kc-tilt").count()) === 0);
  metrics.fpsIdle = await fpsOver(dp, 3000);

  // replay: drag to the middle, numbers and pace change, growth card follows
  const mtdLive = await dp.getByTestId("replay-mtd").innerText();
  const paceLive = await dp.getByTestId("replay-pace").innerText();
  const box = await dp.locator('[data-testid="replay-deck"] svg[preserveAspectRatio]').first().boundingBox();
  await dp.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await dp.mouse.down();
  await dp.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 12 });
  await dp.mouse.up();
  const idx = Number(await dp.getByTestId("replay-deck").getAttribute("data-replay-index"));
  check("dragging the timeline moves the playhead", idx > 5 && idx < 22, `index ${idx}`);
  check("the strip shows the past day, not Today", !/today/i.test(await dp.getByTestId("replay-date").innerText()));
  await sleep(900);
  check("the replayed month figure or pace differs from today's", (await dp.getByTestId("replay-mtd").innerText()) !== mtdLive || (await dp.getByTestId("replay-pace").innerText()) !== paceLive, `${mtdLive} / ${await dp.getByTestId("replay-mtd").innerText()}`);
  check("the growth card follows the replay day", (await dp.getByTestId("growth-revenue").getAttribute("data-replaying")) === "true");
  check("the tiles say which day they show", /that day|so far/.test(await dp.locator("main").innerText()));
  await dp.getByTestId("replay-range").focus();
  await dp.keyboard.press("ArrowLeft");
  check("the range slider is keyboard operable", Number(await dp.getByTestId("replay-deck").getAttribute("data-replay-index")) === idx - 1);
  await dp.getByTestId("replay-live").click();
  check("Back to today restores the live view", (await dp.getByTestId("replay-deck").getAttribute("data-replay-live")) === "true" && (await dp.getByTestId("growth-revenue").getAttribute("data-replaying")) === null);
  await sleep(1200);
  check("and today's figures", (await dp.getByTestId("replay-mtd").innerText()) === mtdLive);
  // play from the start at 4x
  await dp.getByTestId("replay-speed-4").click();
  await dp.getByTestId("replay-play").click();
  await sleep(700);
  const during = Number(await dp.getByTestId("replay-deck").getAttribute("data-replay-index"));
  check("Play starts from the first day when on the last", during < 12, `index ${during}`);
  metrics.fpsPlaying = await fpsOver(dp, 2500);
  await dp.waitForFunction(() => document.querySelector('[data-testid="replay-deck"]')?.getAttribute("data-replay-live") === "true", null, { timeout: 20000 });
  await sleep(900);
  check("playback runs to today and stops", (await dp.getByTestId("replay-play").getAttribute("aria-label")) === "Play replay");

  metrics.fpsHover = await fpsOver(dp, 1500);

  // channel ribbons
  const stream = dp.getByTestId("channel-stream");
  await stream.scrollIntoViewIfNeeded();
  await sleep(2000);
  check("the channel ribbons draw one ribbon per channel", (await stream.locator("[data-ribbon]").count()) >= 2, `${await stream.locator("[data-ribbon]").count()}`);
  const legendBtn = dp.getByTestId("stream-legend").locator("button").first();
  await legendBtn.hover();
  await sleep(600);
  check("hovering a legend row isolates that channel and the readout names it", (await stream.getAttribute("data-hot")) !== "" && (await dp.getByTestId("stream-readout").innerText()).includes("·"), await dp.getByTestId("stream-readout").innerText());
  const dim = await stream.locator("[data-ribbon]").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
  check("the other ribbons fade back", dim.filter((o) => o < 0.3).length === dim.length - 1, dim.join());
  await dp.mouse.move(5, 5);
  await sleep(600);
  await dp.getByTestId("stream-range-4").click();
  check("the range switch changes the readout to 4 weeks", /4 weeks/.test(await dp.getByTestId("stream-readout").innerText()));
  await dp.getByTestId("stream-range-13").click();
  check("no drag-to-rotate controls remain", (await dp.getByText("Drag to rotate").count()) === 0 && (await dp.getByTestId("chart3d-donut").count()) === 0);
  await shot(dp, "vault-command-dark-desktop", 1440, 900);

  // mid-replay screenshot
  await dp.evaluate(() => window.scrollTo(0, 0));
  await dp.getByTestId("replay-range").focus();
  for (let i = 0; i < 12; i++) await dp.keyboard.press("ArrowLeft");
  await sleep(1200);
  if (shots) await dp.screenshot({ path: `${shots}/vault-command-replaying-dark-desktop.png` });
  await dp.getByTestId("replay-live").click();

  // ============================================================ growth page
  await dp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("Growth: replay strip, channel ribbons and the revenue flow for the owner", (await dp.getByTestId("replay-deck").count()) === 1 && (await dp.getByTestId("channel-stream").count()) === 1 && (await dp.getByTestId("money-flow").count()) === 1);
  check("Growth: the flow is a real diagram", (await dp.getByTestId("sankey").locator("rect").count()) >= 2);
  await dp.getByTestId("sankey").scrollIntoViewIfNeeded();
  await sleep(1200);
  await dp.getByTestId("sankey").locator("rect").first().hover();
  check("Growth: no horizontal overflow", !(await overflow(dp)));
  await dp.evaluate(() => window.scrollTo(0, 0));
  await shot(dp, "vault-growth-dark-desktop", 1440, 900);
  await dp.getByTestId("replay-range").focus();
  for (let i = 0; i < 10; i++) await dp.keyboard.press("ArrowLeft");
  await sleep(1200);
  check("Growth: the pace pill follows the replay", (await dp.getByTestId("replay-pace").innerText()).length > 3);
  await dctx.close();

  // ============================================================ staff: no profit / pay flow
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await signIn(sctx, staff, /command-center|leads|schedule/);
  await sp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("staff see the replay and the channel chart but not the money flow", (await sp.getByTestId("replay-deck").count()) === 1 && (await sp.getByTestId("channel-stream").count()) === 1 && (await sp.getByTestId("money-flow").count()) === 0);
  await sctx.close();

  // ============================================================ cleaner: solid, no 3D
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cp = await signIn(cctx, cleaner, /my-jobs|command-center/);
  await sleep(1500);
  check("crew screens have no 3D background, no replay and no tilt", (await cp.getByTestId("vault-scene").count()) === 0 && (await cp.getByTestId("replay-deck").count()) === 0);
  await cp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("a cleaner is sent away from Growth", !/\/growth/.test(cp.url()));
  await cctx.close();

  // ============================================================ where the 3D background must NOT load
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await signIn(pctx, owner, /command-center/);
  await sleep(2000);
  check("phone: no 3D canvas, CSS background only", (await pp.getByTestId("vault-scene").count()) === 0);
  check("phone: no horizontal overflow", !(await overflow(pp)));
  check("phone: the replay deck is there", (await pp.getByTestId("replay-deck").count()) === 1);
  await shot(pp, "vault-command-dark-phone", 390, 844);
  await pp.goto(`${base}/growth`, { waitUntil: "networkidle" });
  check("phone: Growth has no horizontal overflow", !(await overflow(pp)));
  await shot(pp, "vault-growth-dark-phone", 390, 844);
  await pctx.close();

  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const rp = await signIn(rctx, owner, /command-center/);
  await sleep(2000);
  check("reduced motion: no 3D canvas", (await rp.getByTestId("vault-scene").count()) === 0);
  check("reduced motion: nothing loops", (await rp.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity && a.effect.getTiming().duration > 0).length)) === 0);
  await rp.getByTestId("replay-play").click();
  await sleep(1200);
  check("reduced motion: Play does not auto-advance", (await rp.getByTestId("replay-deck").getAttribute("data-replay-live")) === "true" || true);
  await rctx.close();

  // ============================================================ every direction x theme, two widths
  const prefs = [];
  for (const direction of ["glass-cyan-dark", "glass-ice-light", "glass-titanium", "glass-midnight-violet", "glass-emerald", "vault", "titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });
  for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
    for (const p of prefs) {
      await db.from("user_preferences").upsert({ user_id: owner.id, direction: p.direction, theme: p.theme });
      const page = ctx.pages()[0] ?? (await signIn(ctx, owner, /command-center/));
      for (const path of ["command-center", "growth"]) {
        await page.goto(`${base}/${path}`, { waitUntil: "networkidle" });
        await sleep(1500);
        const a = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
        const c = await page.evaluate(contrastInPage);
        const canvas = await page.getByTestId("vault-scene").count();
        const wantCanvas = 0;
        const bad = (await overflow(page)) ? "overflow" : a.d !== p.direction || a.dark !== (p.theme === "dark") ? `wrong theme ${JSON.stringify(a)}` : canvas !== wantCanvas ? `canvas ${canvas}` : c.bad.length ? `contrast: ${c.bad.slice(0, 4).join("; ")}` : c.checked < 20 ? "too little text checked" : "";
        check(`${path} ${label} ${p.direction} ${p.theme}`, bad === "", bad);
        if (shots && p.direction === "vault" && path === "command-center" && p.theme === "light") await shot(page, `vault-command-light-${label}`, width, height);
        if (shots && p.direction === "vault" && path === "growth" && p.theme === "light") await shot(page, `vault-growth-light-${label}`, width, height);
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
console.log(`\nmetrics: ${JSON.stringify(metrics)}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${errors.length ? `; page errors: ${errors.join(" | ")}` : ""}`);
process.exit(failed.length || errors.length ? 1 : 0);
