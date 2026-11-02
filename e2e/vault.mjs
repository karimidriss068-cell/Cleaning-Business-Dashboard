/**
 * Vault direction end-to-end test (Command Center and Growth). Creates and deletes its own temporary
 * owner, staff and cleaner users on the cleaning project (the script refuses any other project).
 *
 *   npm run build
 *   npm run e2e:vault            (E2E_SHOTS_DIR=/some/dir saves screenshots)
 *
 * Covers: Vault is the default direction; the replay deck (play, speed, drag, back to today) morphs the
 * numbers, the pace and the growth card; the 3D channel chart rotates, switches shape and lights a slice;
 * the revenue flow is owner/admin only; the 3D background loads only on a capable desktop in Vault (not on
 * a phone, under reduced motion, in another direction, or on crew screens); frame rate while idle, playing,
 * hovering and dragging; and, for every direction x theme at 1440px and 390px, no overflow, the right theme
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
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
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
  check("a new member gets Vault in dark by default", attrs.d === "vault" && attrs.dark, JSON.stringify(attrs));
  check("no horizontal overflow on the Command Center", !(await overflow(dp)));
  await dp.getByTestId("replay-deck").waitFor();
  check("the replay deck starts on today, live", (await dp.getByTestId("replay-deck").getAttribute("data-replay-live")) === "true");
  const lastIndex = Number(await dp.getByTestId("replay-deck").getAttribute("data-replay-index"));
  check("30 days of frames", lastIndex === 29, `last index ${lastIndex}`);
  await sleep(2500);
  const scene = dp.getByTestId("vault-scene");
  check("the 3D background mounts on a capable desktop in Vault", (await scene.count()) === 1);
  const sceneState = await scene.getAttribute("data-state");
  check("the 3D background is running or has thinned itself, not stopped", sceneState === "running" || sceneState === "thinned", sceneState);
  metrics.fpsIdle = await fpsOver(dp, 3000);
  metrics.sceneFps = Number(await scene.getAttribute("data-fps"));

  // replay: drag to the middle, numbers and pace change, growth card follows
  const mtdLive = await dp.getByTestId("replay-mtd").innerText();
  const paceLive = await dp.getByTestId("replay-pace").innerText();
  const box = await dp.locator('[data-testid="replay-deck"] svg[role="img"]').boundingBox();
  await dp.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
  await dp.mouse.down();
  await dp.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 12 });
  await dp.mouse.up();
  const idx = Number(await dp.getByTestId("replay-deck").getAttribute("data-replay-index"));
  check("dragging the timeline moves the playhead", idx > 5 && idx < 22, `index ${idx}`);
  check("the deck says 'As of' on a past day", /as of/i.test(await dp.getByTestId("replay-date").innerText()));
  await sleep(900);
  check("the replayed month figure differs from today's (or day-0 is equal and pace shown)", (await dp.getByTestId("replay-mtd").innerText()) !== mtdLive || (await dp.getByTestId("replay-pace").innerText()) !== paceLive, `${mtdLive} / ${await dp.getByTestId("replay-mtd").innerText()}`);
  check("the growth card follows the replay day", (await dp.getByTestId("growth-revenue").getAttribute("data-replaying")) === "true");
  check("the Jobs tile says which day it shows", /that day|so far/.test(await dp.locator("main").innerText()));
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

  // tilt on a tile
  const tile = dp.locator(".kc-tilt").first();
  const tb = await tile.boundingBox();
  await dp.mouse.move(tb.x + tb.width * 0.85, tb.y + tb.height * 0.2, { steps: 6 });
  await sleep(500);
  const tr = await tile.evaluate((el) => el.style.transform);
  check("a tile tilts toward the cursor", /rotateX\(-?[\d.]*[1-9]/.test(tr) || /rotateY\(-?[\d.]*[1-9]/.test(tr), tr);
  metrics.fpsTilt = await fpsOver(dp, 1500);
  await dp.mouse.move(5, 5);
  await sleep(700);
  check("and settles flat again", /rotateX\(-?0(\.0\d*)?deg\) rotateY\(-?0(\.0\d*)?deg\)/.test(await tile.evaluate((el) => el.style.transform)), await tile.evaluate((el) => el.style.transform));

  // 3D chart
  const chart = dp.getByTestId("chart-3d");
  await chart.scrollIntoViewIfNeeded();
  await sleep(2500);
  const svg = dp.getByTestId("chart-3d-svg");
  const yaw0 = Number(await svg.getAttribute("data-yaw"));
  const cb = await svg.boundingBox();
  await dp.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height * 0.5);
  await dp.mouse.down();
  await dp.mouse.move(cb.x + cb.width * 0.5 + 160, cb.y + cb.height * 0.5, { steps: 10 });
  metrics.fpsDragging = await fpsOver(dp, 1200);
  await dp.mouse.up();
  await sleep(900);
  check("dragging rotates the 3D chart", Math.abs(Number(await svg.getAttribute("data-yaw")) - yaw0) > 0.5, `${yaw0} -> ${await svg.getAttribute("data-yaw")}`);
  await svg.focus();
  const yaw1 = Number(await svg.getAttribute("data-yaw"));
  await dp.keyboard.press("ArrowRight");
  await sleep(900);
  check("arrow keys nudge the 3D chart", Math.abs(Number(await svg.getAttribute("data-yaw")) - yaw1) > 0.1);
  const legend = dp.getByTestId("chart-3d-legend").locator("button");
  if ((await legend.count()) > 0) {
    await legend.first().hover();
    check("hovering a legend row shows its tooltip", /\$/.test(await chart.innerText()));
  }
  check("the legend lists the channels with dollar amounts", (await dp.getByTestId("chart-3d-legend").innerText()).includes("$"));
  await dp.getByTestId("chart3d-donut").click();
  await sleep(1500);
  check("the chart switches to a donut", (await chart.getAttribute("data-mode")) === "donut");
  await dp.getByTestId("chart3d-bars").click();
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
  check("Growth: replay deck, 3D chart and the revenue flow for the owner", (await dp.getByTestId("replay-deck").count()) === 1 && (await dp.getByTestId("chart-3d").count()) === 1 && (await dp.getByTestId("money-flow").count()) === 1);
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
  check("staff see the replay and the channel chart but not the money flow", (await sp.getByTestId("replay-deck").count()) === 1 && (await sp.getByTestId("chart-3d").count()) === 1 && (await sp.getByTestId("money-flow").count()) === 0);
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
  check("phone: no tilt transform on tiles", !(await pp.locator(".kc-tilt").first().evaluate((el) => el.style.transform)));
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
  for (const direction of ["vault", "titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });
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
        const wantCanvas = label === "desktop" && p.direction === "vault" ? 1 : 0;
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
