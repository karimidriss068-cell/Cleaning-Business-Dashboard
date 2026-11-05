/**
 * Boardroom preview (/board/preview) end-to-end test. A static animated mock: sample data, no AI calls,
 * so it needs no provider keys. It creates and deletes its own temporary owner and staff users on the
 * cleaning project (the script refuses any other project).
 *
 *   npm run build
 *   npm run e2e:board-preview            (E2E_SHOTS_DIR=/some/dir saves screenshots of every moment)
 *
 * Covers: playback (thinking state, streaming speech, speaker glow, reactions, votes and the live score
 * board, verdict, dissent and the 3 actions), pause, speed, skip to verdict, replay; idle animation on
 * normally and none under prefers-reduced-motion (text appears at once); the phone layout (a vertical
 * conversation, no table); owner/admin only; and for every direction x theme at 1440px and 390px, for the
 * opening, mid-debate and verdict moments: no overflow, the right theme, and text contrast (computed
 * colors against the colors behind them; glass backdrops are covered by src/config/brand.test.ts).
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");

const PORT = 3158;
const base = `http://localhost:${PORT}`;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = [];
const shots = process.env.E2E_SHOTS_DIR;

async function cleanup() {
  for (const u of users) {
    await db.from("user_preferences").delete().eq("user_id", u.id);
    await db.from("profiles").delete().eq("user_id", u.id);
    await db.auth.admin.deleteUser(u.id);
  }
}
await cleanup();
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...process.env, NEXT_PUBLIC_APP_URL: base }, stdio: "ignore" });
for (let i = 0; i < 60; i++) {
  if (await fetch(`${base}/login`).then((r) => r.ok).catch(() => false)) break;
  await sleep(1000);
}

// Runs in the page: text contrast of everything visible inside the boardroom, from computed colors.
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
  const root = document.querySelector('[data-testid="boardroom"]');
  const bad = [];
  let checked = 0;
  for (const el of root.querySelectorAll("*")) {
    if (!el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) continue;
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

let browser = null;
const errors = [];
try {
  const password = randomBytes(18).toString("base64url");
  const make = async (role) => {
    const email = `seed+e2eroom-${role}-${randomBytes(3).toString("hex")}@example.com`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    users.push(data.user);
    await db.from("profiles").insert({ user_id: data.user.id, role, full_name: `E2E ${role}`, is_active: true });
    return { id: data.user.id, email };
  };
  const owner = await make("owner");
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
  const room = (page) => page.getByTestId("boardroom");
  const beat = async (page) => Number(await room(page).getAttribute("data-beat"));
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  // ============================================================ playback, desktop, every style
  const tally = async (page) => Promise.all(["for", "conditional", "against"].map(async (v) => Number((await page.getByTestId(`score-${v}`).innerText()).match(/^\s*(\d+)/)?.[1] ?? NaN)));
  for (const style of ["a", "b", "c"]) {
    const t = `[${style}]`;
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const dp = await signIn(dctx, owner, /command-center/);
    await dp.goto(`${base}/board/preview?style=${style}`, { waitUntil: "networkidle" });
    check(`${t} loads with its heading, the sample-data label and the AI label`, (await dp.locator("h1").innerText()) === "Boardroom preview" && /Sample data/.test(await dp.locator("body").innerText()) && /AI approximation[\s\S]*Not real people/.test(await dp.getByTestId("scene-label").innerText()));
    check(`${t} the style switcher marks the current style`, (await dp.getByTestId(`style-${style}`).getAttribute("aria-current")) === "page" && (await room(dp).getAttribute("data-style")) === style);
    check(`${t} the stage shows the chair and five advisors`, (await dp.getByTestId("scene-stage").locator('[data-testid^="seat-"]').count()) === 6);
    check(`${t} the phone conversation is hidden on desktop`, !(await dp.getByTestId("scene-conversation").isVisible()));
    check(`${t} the chair opens first`, (await dp.getByTestId("scene-caption").getAttribute("data-speaker")) === "chair");
    check(`${t} ambient motion runs`, (await dp.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length)) >= 4);
    await dp.waitForFunction(() => document.querySelector('[data-testid="scene-caption"]')?.textContent?.includes("is thinking"), null, { timeout: 30000 });
    check(`${t} an advisor shows a thinking state before talking`, /is thinking/.test(await dp.getByTestId("scene-caption").innerText()));
    await dp.waitForFunction(() => document.querySelector('[data-testid="scene-stage"] [data-state="speaking"]'), null, { timeout: 30000 });
    await dp.waitForFunction(() => (document.querySelector('[data-testid="scene-caption"]')?.textContent?.length ?? 0) > 30, null, { timeout: 10000 });
    const speaker = await dp.getByTestId("scene-caption").getAttribute("data-speaker");
    check(`${t} the speaker is the only one marked speaking and has a streaming caption`, speaker !== "chair" && (await dp.getByTestId(`seat-${speaker}`).getAttribute("data-state")) === "speaking" && (await dp.getByTestId("scene-stage").locator('[data-testid^="seat-"][data-state="speaking"]').count()) === 1 && (await dp.getByTestId("scene-caption").innerText()).length > 20);
    const t1 = (await dp.getByTestId("scene-caption").innerText()).length;
    await sleep(700);
    check(`${t} the speech streams in`, (await dp.getByTestId("scene-caption").innerText()).length >= t1);
    await dp.getByTestId("scene-play").click();
    const pausedAt = await beat(dp);
    const pausedText = await dp.getByTestId("scene-caption").innerText();
    await sleep(1500);
    check(`${t} pause holds the scene still`, (await beat(dp)) === pausedAt && (await dp.getByTestId("scene-caption").innerText()) === pausedText && (await room(dp).getAttribute("data-playing")) === "false");
    await dp.getByTestId("scene-play").click();
    await dp.getByTestId("scene-speed-4").click();
    check(`${t} speed 4x is selected`, (await dp.getByTestId("scene-speed-4").getAttribute("aria-pressed")) === "true" && (await dp.getByTestId("scene-speed-1").getAttribute("aria-pressed")) === "false");
    await dp.waitForSelector('[data-testid="scene-reaction"]', { timeout: 45000 });
    check(`${t} a reaction appears between advisors`, /(Agrees|Pushes back|Adds a condition) · /.test(await dp.getByTestId("scene-reaction").first().innerText()));
    await dp.waitForFunction(() => document.querySelector('[data-testid="boardroom"]')?.getAttribute("data-stage") === "voting", null, { timeout: 60000 });
    check(`${t} nobody is singled out while the votes come in`, (await dp.getByTestId("scene-stage").locator('[data-testid^="seat-"][data-state="speaking"], [data-testid^="seat-"][data-state="thinking"]').count()) === 0);
    await sleep(1800);
    check(`${t} votes appear on the seats and the vote panel counts them live`, (await dp.getByTestId("scene-stage").getByText(/^(Yes|Yes, if…|No)$/).count()) >= 1 && (await tally(dp)).reduce((x, y) => x + y, 0) >= 1, `tally ${await tally(dp)}`);
    await dp.waitForFunction(() => document.querySelector('[data-testid="boardroom"]')?.getAttribute("data-stage") === "verdict", null, { timeout: 60000 });
    await dp.getByTestId("scene-verdict").waitFor({ timeout: 10000 });
    await dp.getByTestId("scene-actions").locator("li").nth(2).waitFor({ timeout: 30000 });
    check(`${t} final tally: 1 yes, 2 yes-if, 2 no`, (await tally(dp)).join() === "1,2,2", (await tally(dp)).join());
    check(`${t} the verdict panel has the verdict, the dissent and exactly three actions`, (await dp.getByTestId("scene-verdict").innerText()).includes("Go, with conditions") && (await dp.getByTestId("scene-dissent").locator("li").count()) === 2 && (await dp.getByTestId("scene-actions").locator("li").count()) === 3);
    await dp.waitForFunction(() => document.querySelector('[data-testid="boardroom"]')?.getAttribute("data-done") === "true", null, { timeout: 30000 });
    check(`${t} at the end the button offers a replay and nobody is marked speaking`, /Replay/.test(await dp.getByTestId("scene-play").innerText()) && (await dp.getByTestId("scene-stage").locator('[data-testid^="seat-"][data-state="speaking"]').count()) === 0);
    await dp.getByTestId("scene-replay").click();
    check(`${t} replay starts over from the chair's opening`, (await beat(dp)) <= 1 && (await room(dp).getAttribute("data-stage")) === "opening" && (await dp.getByTestId("scene-verdict").count()) === 0);
    await dp.getByTestId("scene-skip").click();
    await dp.getByTestId("scene-verdict").waitFor({ timeout: 10000 });
    check(`${t} skip to verdict jumps there with every vote counted`, (await tally(dp)).join() === "1,2,2" && (await room(dp).getAttribute("data-stage")) === "verdict");
    check(`${t} skip is disabled once at the verdict`, await dp.getByTestId("scene-skip").isDisabled());
    if (style === "a") {
      await dp.getByTestId("style-b").click();
      await dp.waitForURL(/style=b/);
      check("the switcher changes the style", (await room(dp).getAttribute("data-style")) === "b");
    }
    await dctx.close();
  }

  // ============================================================ reduced motion
  const nctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const np = await signIn(nctx, owner, /command-center/);
  await np.goto(`${base}/board/preview?moment=debate`, { waitUntil: "networkidle" });
  const normalLen = (await np.getByTestId("scene-caption").innerText()).length;
  await nctx.close();
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const rp = await signIn(rctx, owner, /command-center/);
  await rp.goto(`${base}/board/preview?moment=debate`, { waitUntil: "networkidle" });
  const rtext = await rp.getByTestId("scene-caption").innerText();
  check("under reduced motion the speech appears in full at once (longer than the half-streamed normal one)", rtext.length > normalLen && (await rp.getByTestId("scene-caption").locator("span[aria-hidden]").count()) === 0, `${normalLen} vs ${rtext.length}`);
  check("under reduced motion nothing loops", (await rp.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity && a.effect.getTiming().duration > 0).length)) === 0);
  await rctx.close();

  // ============================================================ phone layout
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await signIn(pctx, owner, /command-center/);
  for (const style of ["a", "b", "c"]) {
    await pp.goto(`${base}/board/preview?style=${style}&moment=debate`, { waitUntil: "networkidle" });
    check(`[${style}] phone: a vertical conversation with avatar chips and no stage`, (await pp.getByTestId("scene-conversation").isVisible()) && !(await pp.getByTestId("scene-stage").isVisible()) && (await pp.getByTestId("scene-conversation").locator("svg").count()) >= 3);
    check(`[${style}] phone: no horizontal overflow`, !(await overflow(pp)));
    check(`[${style}] phone: the controls are at least 44px tall`, (await pp.getByTestId("scene-play").boundingBox()).height >= 44);
  }
  await pctx.close();

  // ============================================================ who may see it
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const sp = await signIn(sctx, staff, /command-center|leads|schedule/);
  await sp.goto(`${base}/board/preview`, { waitUntil: "networkidle" });
  check("staff are sent away from the preview", !/\/board/.test(sp.url()));
  await sctx.close();

  // ============================================================ every direction x theme, three moments, two widths
  const prefs = [];
  for (const direction of ["titanium", "ocean", "midnight"]) for (const theme of ["dark", "light"]) prefs.push({ direction, theme });
  for (const [width, height, label] of [[1440, 1000, "desktop"], [390, 844, "phone"]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 });
    for (const p of prefs) {
      await db.from("user_preferences").upsert({ user_id: owner.id, direction: p.direction, theme: p.theme });
      const page = ctx.pages()[0] ?? (await signIn(ctx, owner, /command-center/));
      for (const [style, moment] of ["a", "b", "c"].flatMap((st) => ["opening", "debate", "verdict"].map((m) => [st, m]))) {
        await page.goto(`${base}/board/preview?style=${style}&moment=${moment}`, { waitUntil: "networkidle" });
        await sleep(1800);
        const attrs = await page.evaluate(() => ({ d: document.documentElement.dataset.direction, dark: document.documentElement.classList.contains("dark") }));
        const c = await page.evaluate(contrastInPage);
        const bad = (await overflow(page)) ? "overflow" : attrs.d !== p.direction || attrs.dark !== (p.theme === "dark") ? `wrong theme ${JSON.stringify(attrs)}` : (await room(page).getAttribute("data-stage")) !== (moment === "opening" ? "opening" : moment === "debate" ? "debate" : "verdict") ? "wrong moment" : c.bad.length ? `contrast: ${c.bad.slice(0, 4).join("; ")}` : c.checked < 8 ? "too little text checked" : "";
        check(`style ${style} ${moment} ${label} ${p.direction} ${p.theme}`, bad === "", bad);
        if (shots) {
          // Size the window to the whole page rather than a fullPage capture, so entrance animations finish before the shot.
          const full = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({ width, height: full });
          await sleep(1500);
          await page.screenshot({ path: `${shots}/room-${style}-${moment}-${label}-${p.direction}-${p.theme}.png` });
          await page.setViewportSize({ width, height });
        }
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
