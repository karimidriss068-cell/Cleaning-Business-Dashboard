/**
 * Crew view end-to-end test, run by hand against a running build and the
 * cleaning project's demo data (the script refuses any other project):
 *
 *   npm run build && npx next start -p 3132 &
 *   E2E_BASE=http://localhost:3132 CREW_EMAIL=seed+ana@example.com CREW_PASSWORD=... npm run e2e:crew
 *
 * Signs in as a cleaner on a phone-sized viewport and proves they only ever
 * see their own visits and their own pay (pages and raw API), then exercises
 * checklist, notes, photo upload (with type/size limits), the too-early
 * Complete rule and the insurance reminder. Everything it changes is restored.
 */
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url?.includes("lijsaulkeaqlriwqgxty")) throw new Error("refusing: .env.local isn't the cleaning project");
const { E2E_BASE: base, CREW_EMAIL: email, CREW_PASSWORD: password } = process.env;
if (!base || !email || !password) throw new Error("set E2E_BASE, CREW_EMAIL and CREW_PASSWORD");

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
const nyDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

// ---- ground truth from the database
const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
const me = users.users.find((u) => u.email === email);
const { data: profile } = await db.from("profiles").select("subcontractor_id").eq("user_id", me.id).single();
const subId = profile.subcontractor_id;
const todayNy = nyDate(new Date());
const horizon = nyDate(new Date(Date.now() + 14 * 86400000));
const { data: mine } = await db.from("job_assignments").select("pay_cents, job:jobs!inner(id, status, scheduled_start, scheduled_end, service_id)").eq("subcontractor_id", subId);
const inWindow = mine.filter((a) => a.job.status !== "cancelled" && nyDate(new Date(a.job.scheduled_start)) >= todayNy && nyDate(new Date(a.job.scheduled_start)) <= horizon);
const myPayStrings = new Set(inWindow.filter((a) => a.pay_cents !== null).map((a) => `$${(a.pay_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`));
const todaysTotal = inWindow.filter((a) => nyDate(new Date(a.job.scheduled_start)) === todayNy).reduce((t, a) => t + (a.pay_cents ?? 0), 0);
const todaysTotalLabel = `$${(todaysTotal / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const { data: others } = await db.from("job_assignments").select("pay_cents, subcontractor_id, job_id").neq("subcontractor_id", subId);
const myJobIds = new Set(mine.map((a) => a.job.id));
const othersOnly = others.find((o) => !myJobIds.has(o.job_id));
const { data: sharedRows } = await db.from("job_assignments").select("pay_cents, subcontractor_id, job_id").in("job_id", [...myJobIds]).neq("subcontractor_id", subId);
const teammatePay = new Set((sharedRows ?? []).filter((r) => r.pay_cents !== null).map((r) => `$${(r.pay_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`));
for (const p of myPayStrings) teammatePay.delete(p); // an equal amount isn't a leak

// Start from a clean slate if an earlier run was interrupted.
{
  const { data: leftovers } = await db.from("job_photos").select("storage_path").eq("uploaded_by", me.id);
  if (leftovers?.length) await db.storage.from("job-photos").remove(leftovers.map((r) => r.storage_path));
  await db.from("job_photos").delete().eq("uploaded_by", me.id);
  await db.from("job_cleaner_notes").delete().eq("subcontractor_id", subId);
  await db.from("job_checklist_items").update({ done_at: null, done_by: null }).eq("done_by", me.id);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill("#email", email); await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForURL(/\/my-jobs/, { timeout: 20000 });
await page.getByRole("heading", { level: 1 }).waitFor();
await page.waitForTimeout(800);

// ---- 1. Lands on the crew screen; only their visits; no office anything
check("sign-in lands on My jobs", new URL(page.url()).pathname === "/my-jobs");
const cards = await page.locator("article").count();
check("shows exactly their visits (today + next 14 days)", cards === inWindow.length, `${cards} vs ${inWindow.length}`);
const bodyText = await page.locator("body").innerText();
for (const word of ["Invoices", "Payouts", "Leads", "Marketing", "Automations", "Command Center", "Schedule", "Crews"]) {
  if (new RegExp(`\\b${word}\\b`).test(bodyText)) check(`no office navigation text: ${word}`, false);
}
check("no office navigation text on the crew home", !/Invoices|Payouts|Leads & Pipeline|Marketing|Automations/.test(bodyText));
const amounts = [...bodyText.matchAll(/\$[\d,]+\.\d{2}/g)].map((m) => m[0]);
check("every dollar amount shown is their own pay or their own total for today", amounts.every((a) => myPayStrings.has(a) || a === todaysTotalLabel), `shown: ${amounts.join(",")}; own total today: ${todaysTotalLabel}`);
check("no teammate's pay appears", ![...teammatePay].some((p) => bodyText.includes(p)), [...teammatePay].join(","));
check("no phone numbers or emails on the page", !/\+1\d{10}|@example\.com|\(\d{3}\) \d{3}/.test(bodyText));

// ---- 2. Office routes bounce to My jobs
for (const path of ["/command-center", "/schedule", "/money", "/leads", "/crews", "/marketing", "/automations"]) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  check(`${path} redirects to My jobs`, new URL(page.url()).pathname === "/my-jobs", new URL(page.url()).pathname);
}

// ---- 3. Someone else's visit is a 404
if (othersOnly) {
  const res = await page.goto(`${base}/my-jobs/${othersOnly.job_id}`, { waitUntil: "networkidle" });
  check("another cleaner's visit is not found", res?.status() === 404 || /could not be found|not found|page not found/i.test(await page.locator("body").innerText()));
}

// ---- 4. Raw API as this cleaner: office tables are empty, RPC returns only theirs
const apiClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await apiClient.auth.signInWithPassword({ email, password });
for (const t of ["invoices", "payments", "payouts", "contacts", "accounts", "jobs", "job_assignments", "leads", "quotes", "subcontractors", "crews", "services", "expenses"]) {
  const { data, error } = await apiClient.from(t).select("*").limit(5);
  if ((data ?? []).length > 0 || (error && error.code !== "42501")) check(`API: ${t} readable by a cleaner`, false, JSON.stringify(data?.[0] ?? error).slice(0, 120));
}
check("API: office tables return nothing to a cleaner", true);
const { data: apiVisits } = await apiClient.rpc("crew_visits");
check("API: crew_visits returns only their visits", apiVisits.length === inWindow.length && apiVisits.every((v) => myJobIds.has(v.job_id)));
check("API: crew_visits has no billing/contact columns", !Object.keys(apiVisits[0] ?? {}).some((k) => /price|invoice|phone|email|last_name|payout|account/.test(k)));

// ---- 5. Visit detail: checklist, note, photos, too-early
const upcoming = inWindow.filter((a) => a.job.status === "scheduled").sort((a, b) => a.job.scheduled_start.localeCompare(b.job.scheduled_start));
const target = upcoming.find((a) => new Date(a.job.scheduled_start).getTime() - Date.now() > 3 * 3600000) ?? upcoming[0];
const jobId = target.job.id;
await page.goto(`${base}/my-jobs/${jobId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const boxes = page.getByRole("checkbox");
check("checklist is shown (from the service template)", (await boxes.count()) >= 1);
await boxes.first().click();
await page.waitForTimeout(1500);
const { count: ticked } = await db.from("job_checklist_items").select("id", { count: "exact", head: true }).eq("job_id", jobId).not("done_at", "is", null);
check("ticking a task persists", ticked === 1);
const note = "E2E note: gate code changed";
await page.getByLabel("Your notes for this visit").fill(note);
await page.getByRole("button", { name: "Save note" }).click();
await page.waitForTimeout(1500);
const { data: savedNote } = await db.from("job_cleaner_notes").select("note").eq("job_id", jobId).eq("subcontractor_id", subId).maybeSingle();
check("notes persist", savedNote?.note === note);

const jpeg = Buffer.from(await page.evaluate(async () => {
  const c = document.createElement("canvas"); c.width = 320; c.height = 200;
  const x = c.getContext("2d"); x.fillStyle = "#3a7bd5"; x.fillRect(0, 0, 320, 200);
  const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  return Array.from(new Uint8Array(await b.arrayBuffer()));
}));
const input = page.getByTestId("photo-input-before");
await input.setInputFiles({ name: "before.jpg", mimeType: "image/jpeg", buffer: jpeg });
await page.waitForTimeout(3500);
const { data: photoRows } = await db.from("job_photos").select("id, storage_path, uploaded_by, kind").eq("job_id", jobId);
check("a photo uploads to the private bucket and is recorded", photoRows.length === 1 && photoRows[0].kind === "before" && photoRows[0].uploaded_by === me.id, JSON.stringify(photoRows));
const { data: obj } = photoRows[0] ? await db.storage.from("job-photos").createSignedUrl(photoRows[0].storage_path, 60) : { data: null };
check("the file exists in storage under the visit's folder", !!obj && photoRows[0].storage_path.startsWith(`${jobId}/`));
const anon = await fetch(`${url}/storage/v1/object/public/job-photos/${photoRows[0]?.storage_path}`);
check("the bucket is private (public URL refused)", anon.status >= 400);
await input.setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
await page.waitForTimeout(800);
check("a non-photo is refused with a clear message", await page.getByText("isn't a photo").isVisible().catch(() => false));
await input.setInputFiles({ name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(11 * 1024 * 1024, 1) });
await page.waitForTimeout(800);
check("an oversized photo is refused with a clear message", await page.getByText(/too large/).isVisible().catch(() => false));
const { data: afterBad } = await db.from("job_photos").select("id").eq("job_id", jobId);
check("refused files were not recorded", afterBad.length === 1);
// Server-side limits too: a PDF straight to the bucket as this cleaner is rejected.
const direct = await apiClient.storage.from("job-photos").upload(`${jobId}/direct.pdf`, new Blob(["%PDF"], { type: "application/pdf" }), { contentType: "application/pdf" });
check("the bucket itself rejects non-image uploads", !!direct.error, direct.error?.message);
const otherJob = othersOnly?.job_id;
if (otherJob) {
  const cross = await apiClient.storage.from("job-photos").upload(`${otherJob}/x.jpg`, new Blob([jpeg], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  check("uploading into another visit's folder is rejected", !!cross.error, cross.error?.message);
}

// Complete: too early
const tooEarlyBtn = page.getByRole("button", { name: /^Opens at/ });
check("a future visit shows 'Opens at …' and the explanation", (await tooEarlyBtn.count()) === 1 && (await page.getByText("Too early to complete").isVisible()));
await tooEarlyBtn.click({ force: true }); // aria-disabled on purpose: tapping explains why
await page.waitForTimeout(600);
check("tapping it explains instead of failing", await page.getByText("You can complete this visit from").first().isVisible().catch(() => false));
const { data: stillOpen } = await db.from("jobs").select("status").eq("id", jobId).single();
check("the visit was not completed", stillOpen.status === "scheduled");
if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/crew-detail.png`, fullPage: true });

// ---- 6. Complete inside the window, then restore
const soon = upcoming.find((a) => a.job.id !== jobId) ?? target;
const orig = { start: soon.job.scheduled_start, end: soon.job.scheduled_end };
const newStart = new Date(Date.now() + 30 * 60000);
await db.from("jobs").update({ scheduled_start: newStart.toISOString(), scheduled_end: new Date(newStart.getTime() + 2 * 3600000).toISOString() }).eq("id", soon.job.id);
await page.goto(`${base}/my-jobs/${soon.job.id}`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Mark visit complete|Yes, complete visit/ }).click();
if (await page.getByText(/aren't ticked|isn't ticked/).isVisible().catch(() => false)) await page.getByRole("button", { name: "Yes, complete visit" }).click();
await page.waitForTimeout(2500);
const { data: done } = await db.from("jobs").select("status, completed_by").eq("id", soon.job.id).single();
check("completing inside the window works", done.status === "completed" && done.completed_by === me.id);
check("the screen shows it as completed and read-only", await page.getByText(/Completed at/).isVisible().catch(() => false));
await db.from("jobs").update({ status: "scheduled", completed_at: null, completed_by: null, scheduled_start: orig.start, scheduled_end: orig.end }).eq("id", soon.job.id);

// ---- 7. Insurance reminder
const { data: subRow } = await db.from("subcontractors").select("coi_expires_on").eq("id", subId).single();
const setCoi = (days) => db.from("subcontractors").update({ coi_expires_on: nyDate(new Date(Date.now() + days * 86400000)) }).eq("id", subId);
await setCoi(10);
await page.goto(`${base}/my-jobs`, { waitUntil: "networkidle" });
check("insurance expiring soon shows a warning banner", await page.getByText(/expires in \d+ days?/).isVisible().catch(() => false));
await setCoi(-3);
await page.goto(`${base}/my-jobs`, { waitUntil: "networkidle" });
check("expired insurance shows a danger banner", await page.getByText("Your insurance certificate has expired").isVisible().catch(() => false));
await db.from("subcontractors").update({ coi_expires_on: subRow.coi_expires_on }).eq("id", subId);

// ---- cleanup
for (const p of photoRows) { await db.storage.from("job-photos").remove([p.storage_path]); }
await db.from("job_photos").delete().eq("job_id", jobId);
await db.from("job_cleaner_notes").delete().eq("job_id", jobId).eq("subcontractor_id", subId);
await db.from("job_checklist_items").update({ done_at: null, done_by: null }).eq("job_id", jobId);
if (errors.length) check("no page errors", false, errors.join(" | "));
await ctx.close(); await browser.close();

const bad = results.filter((r) => !r.ok);
console.log(results.map((r) => `${r.ok ? "PASS" : "FAIL"} ${r.name}${!r.ok && r.detail ? ` [${r.detail}]` : ""}`).join("\n"));
console.log(bad.length ? `\n${bad.length} FAILED` : `\nall ${results.length} passed`);
process.exit(bad.length ? 1 : 0);
