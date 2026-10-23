/**
 * Dev seed: realistic, deterministic fake NYC data for the cleaning project.
 *
 *   node scripts/seed.mts --project-ref lijsaulkeaqlriwqgxty --dry-run [--out seed.sql]
 *   node scripts/seed.mts --project-ref lijsaulkeaqlriwqgxty
 *   node scripts/seed.mts --project-ref lijsaulkeaqlriwqgxty --purge
 *
 * Tagging: every seed row in every table has an id starting "5eed0000-"
 * (valid UUID shape) and that prefix is the ONLY purge tag. Source columns
 * hold realistic values (meta, google, nextdoor, yelp, referral, repeat). Fake
 * phones are in the reserved 555-01xx range, emails are @example.com, and the
 * two subcontractor test logins are seed+ana@example.com / seed+luis@example.com
 * with user_metadata.seed = true.
 *
 * --dry-run  builds the SQL (written to --out if given), prints a summary, and
 *            executes it inside a transaction that always rolls back, so every
 *            constraint and trigger is checked and nothing is kept.
 * (default)  refuses if seed rows exist; creates the two test logins (random
 *            passwords printed once), then runs the SQL as one atomic block.
 * --purge    refuses if any real row references a seed row; otherwise removes
 *            every seed row and the test logins in one atomic block.
 *
 * Refuses unless --project-ref names the cleaning project and matches .env.local.
 * All SQL runs through scripts/supabase-cleaning.sh, which re-verifies the
 * linked project ref before every command.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const CLEANING_PROJECT_REF = "lijsaulkeaqlriwqgxty";
const MAKI_PROJECT_REF = "dpmgeqxwufqcwboprckw";
const SEED_PREFIX = "5eed0000-";
const NY = "America/New_York";
const TEST_LOGINS = [
  { key: "ana", email: "seed+ana@example.com", name: "Ana Ruiz" },
  { key: "luis", email: "seed+luis@example.com", name: "Luis Fernández" },
] as const;

function fail(message: string): never {
  console.error(`seed: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- arguments

const { values } = parseArgs({
  options: {
    "project-ref": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    purge: { type: "boolean", default: false },
    out: { type: "string" },
  },
});
if (values["project-ref"] !== CLEANING_PROJECT_REF) fail(`pass --project-ref ${CLEANING_PROJECT_REF} explicitly`);
if (values["dry-run"] && values.purge) fail("--dry-run and --purge can't be combined");

try {
  process.loadEnvFile(".env.local");
} catch {
  fail("could not read .env.local (run from the repo root)");
}
const env = z
  .object({ NEXT_PUBLIC_SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1) })
  .safeParse(process.env);
if (!env.success) fail("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
const supabaseUrl = env.data.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl.includes(MAKI_PROJECT_REF)) fail("refusing to run against the archived MAKI project");
if (supabaseUrl !== `https://${CLEANING_PROJECT_REF}.supabase.co`) {
  fail(`.env.local points at ${supabaseUrl}, not ${CLEANING_PROJECT_REF}`);
}

// ---------------------------------------------------------------- SQL helpers

type SqlValue = string | number | boolean | null | { raw: string };
type Row = Record<string, SqlValue>;

// Numbers must be integers (money is integer cents); pass decimals such as
// bathroom counts as numeric strings.
function lit(v: SqlValue): string {
  if (v === null) return "null";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error(`non-integer number in seed SQL: ${v}`);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return v.raw;
  return `'${v.replace(/'/g, "''")}'`;
}

function insertSql(table: string, rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const values = rows.slice(i, i + 200).map((r) => {
      const keys = Object.keys(r);
      if (keys.length !== cols.length || !cols.every((c) => c in r)) {
        throw new Error(`column mismatch in ${table}: ${keys.join(",")} vs ${cols.join(",")}`);
      }
      return `  (${cols.map((c) => lit(r[c])).join(", ")})`;
    });
    out.push(`insert into public.${table} (${cols.join(", ")}) values\n${values.join(",\n")};`);
  }
  return out.join("\n");
}

const counters = new Map<string, number>();
// 5eed0000-TTTT-4000-8000-NNNNNNNNNNNN: TTTT is a per-table code.
function seedId(tableCode: number): string {
  const n = (counters.get(String(tableCode)) ?? 0) + 1;
  counters.set(String(tableCode), n);
  return `${SEED_PREFIX}${tableCode.toString(16).padStart(4, "0")}-4000-8000-${n.toString(16).padStart(12, "0")}`;
}
const T = {
  services: 1, campaigns: 2, stats: 3, accounts: 4, contacts: 5, properties: 6, leads: 7, activities: 8,
  quotes: 9, quoteItems: 10, subs: 11, crews: 12, crewMembers: 13, subDocs: 14, series: 15, jobs: 16,
  assignments: 17, invoices: 18, invoiceItems: 19, payments: 20, vendors: 21, expenses: 22, payouts: 23,
  payoutItems: 24, automations: 25, optOuts: 26, goals: 27,
} as const;

// ---------------------------------------------------------------- deterministic randomness

let state = 20261023;
function rand(): number {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;

// ---------------------------------------------------------------- time (UTC storage, NY calendar)

function nyDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function nyOffsetMinutes(utcMs: number): number {
  const tz =
    new Intl.DateTimeFormat("en-US", { timeZone: NY, timeZoneName: "longOffset" })
      .formatToParts(new Date(utcMs))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(tz);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}
/** NY wall-clock date + time -> UTC instant (DST-safe). */
function nyToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - nyOffsetMinutes(guess) * 60000;
  return new Date(guess - nyOffsetMinutes(first) * 60000);
}
const iso = (d: Date) => d.toISOString();
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const now = new Date();
const today = nyDate(now);
const historyStart = addDays(today, -90);
const horizon = addDays(today, 56);

// ---------------------------------------------------------------- reference data (all fictional)

const FIRST = ["Maria", "James", "Aisha", "Wei", "Sofia", "Daniel", "Priya", "Kwame", "Elena", "Marcus", "Yuki", "Olivia",
  "Diego", "Hannah", "Omar", "Grace", "Liam", "Fatima", "Noah", "Chloe", "Rafael", "Nadia", "Ethan", "Leah", "Andre",
  "Mei", "Samuel", "Zoe", "Ibrahim", "Rachel", "Tomas", "Amara", "Jonah", "Isabel", "Kenji", "Tara", "Victor", "Lucia",
  "Malik", "Nora"] as const;
const LAST = ["Rodriguez", "Chen", "Johnson", "Patel", "Williams", "Nguyen", "Garcia", "Cohen", "Okafor", "Kim",
  "Martinez", "Brown", "Rossi", "Singh", "Lopez", "Murphy", "Ali", "Schwartz", "Park", "Davis", "Hernandez", "Levy",
  "Mensah", "Wong", "Torres", "Goldberg", "Ivanova", "Thompson", "Rivera", "Sato"] as const;

type Borough = "manhattan" | "brooklyn" | "queens" | "bronx" | "staten_island";
const BOROUGHS: Record<Borough, { weight: number; areas: string[]; streets: string[]; zips: Record<string, string> }> = {
  manhattan: {
    weight: 30, areas: ["212", "646", "917"],
    streets: ["W 86th St", "E 72nd St", "Amsterdam Ave", "Lexington Ave", "W 23rd St", "Bleecker St", "Riverside Dr", "E 14th St"],
    zips: { "10001": "New York", "10003": "New York", "10011": "New York", "10014": "New York", "10016": "New York",
      "10019": "New York", "10023": "New York", "10025": "New York", "10028": "New York", "10128": "New York" },
  },
  brooklyn: {
    weight: 32, areas: ["718", "347", "929"],
    streets: ["5th Ave", "Prospect Pl", "Bedford Ave", "Court St", "Atlantic Ave", "Union St", "Bergen St", "Driggs Ave"],
    zips: { "11201": "Brooklyn", "11205": "Brooklyn", "11211": "Brooklyn", "11215": "Brooklyn", "11217": "Brooklyn",
      "11218": "Brooklyn", "11222": "Brooklyn", "11225": "Brooklyn", "11238": "Brooklyn" },
  },
  queens: {
    weight: 22, areas: ["718", "347", "929"],
    streets: ["31st Ave", "Ditmars Blvd", "Queens Blvd", "Austin St", "37th Ave", "Steinway St", "Broadway"],
    zips: { "11101": "Long Island City", "11103": "Astoria", "11104": "Sunnyside", "11354": "Flushing",
      "11372": "Jackson Heights", "11375": "Forest Hills", "11377": "Woodside", "11385": "Ridgewood" },
  },
  bronx: {
    weight: 9, areas: ["718", "347"],
    streets: ["Grand Concourse", "Arthur Ave", "Johnson Ave", "Riverdale Ave", "E Tremont Ave"],
    zips: { "10451": "Bronx", "10452": "Bronx", "10461": "Bronx", "10463": "Bronx", "10467": "Bronx", "10471": "Bronx" },
  },
  staten_island: {
    weight: 7, areas: ["718", "347"],
    streets: ["Victory Blvd", "Hylan Blvd", "Forest Ave", "Richmond Ave"],
    zips: { "10301": "Staten Island", "10304": "Staten Island", "10306": "Staten Island", "10312": "Staten Island", "10314": "Staten Island" },
  },
};
function pickBorough(): Borough {
  const entries = Object.entries(BOROUGHS) as [Borough, (typeof BOROUGHS)[Borough]][];
  let r = rand() * entries.reduce((s, [, b]) => s + b.weight, 0);
  for (const [name, b] of entries) {
    r -= b.weight;
    if (r <= 0) return name;
  }
  return "brooklyn";
}
let phoneSeq = 0;
/** Reserved fictional range: 555-0100 through 555-0199. */
function fakePhone(area: string): string {
  return `+1${area}55501${String(phoneSeq++ % 100).padStart(2, "0")}`;
}
function slug(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
}
function address(b: Borough) {
  const info = BOROUGHS[b];
  const zip = pick(Object.keys(info.zips));
  return { line1: `${int(10, 899)} ${pick(info.streets)}`, zip, city: info.zips[zip] };
}

// ---------------------------------------------------------------- data model

const rows: Record<string, Row[]> = {};
const add = (table: string, row: Row) => (rows[table] ??= []).push(row);
const postInsert: string[] = [];

// Services
const svc = {
  standard: { id: seedId(T.services), name: "Standard clean", model: "flat", price: 16000, minutes: 150 },
  deep: { id: seedId(T.services), name: "Deep clean", model: "flat", price: 28000, minutes: 240 },
  move: { id: seedId(T.services), name: "Move-in/move-out clean", model: "flat", price: 38000, minutes: 300 },
  construction: { id: seedId(T.services), name: "Post-construction clean", model: "per_sqft", price: 35, minutes: 360 },
  office: { id: seedId(T.services), name: "Office cleaning", model: "flat", price: 32000, minutes: 180 },
  airbnb: { id: seedId(T.services), name: "Airbnb turnover", model: "flat", price: 12000, minutes: 90 },
} as const;
for (const s of Object.values(svc)) {
  add("services", { id: s.id, name: s.name, description: null, pricing_model: s.model, base_price_cents: s.price,
    default_duration_minutes: s.minutes, is_active: true });
}
function homePrice(service: keyof typeof svc, bedrooms: number, bathrooms: number): number {
  const size = 3500 * bedrooms + 2500 * Math.max(0, Math.ceil(bathrooms) - 1);
  if (service === "standard") return 12000 + size;
  if (service === "deep") return 22000 + size * 1.5;
  if (service === "move") return 30000 + size * 2;
  if (service === "airbnb") return 9000 + 1500 * bedrooms;
  return 0;
}

// Marketing
const campaigns = [
  { id: seedId(T.campaigns), platform: "google", ext: "seed-g-1", name: "Search – house cleaning NYC", utm: "google", daily: [3500, 9000] },
  { id: seedId(T.campaigns), platform: "meta", ext: "seed-m-1", name: "Fall deep clean – Brooklyn & Queens", utm: "facebook", daily: [2000, 6000] },
  { id: seedId(T.campaigns), platform: "nextdoor", ext: "seed-n-1", name: "Neighborhood intro offer", utm: "nextdoor", daily: [800, 2500] },
  { id: seedId(T.campaigns), platform: "yelp", ext: "seed-y-1", name: "Yelp ads – Manhattan", utm: "yelp", daily: [1500, 4000] },
] as const;
for (const c of campaigns) {
  add("marketing_campaigns", { id: c.id, platform: c.platform, external_id: c.ext, name: c.name, status: "active",
    start_date: historyStart, end_date: null, budget_cents: 300000 });
  for (let d = historyStart; d < today; d = addDays(d, 1)) {
    const spend = int(c.daily[0], c.daily[1]);
    const impressions = Math.round(spend * (rand() * 0.6 + 0.7));
    const clicks = Math.round(impressions * (0.012 + rand() * 0.02));
    add("marketing_daily_stats", { id: seedId(T.stats), campaign_id: c.id, date: d, spend_cents: spend,
      impressions, clicks, leads: chance(0.35) ? int(1, 2) : 0 });
  }
}

// Subcontractors and crews
type Sub = { id: string; name: string; payType: "percent" | "flat" | "hourly"; boroughs: Borough[]; login?: string };
const subSpecs: [string, Sub["payType"], number, Borough[], string, string?][] = [
  ["Ana Ruiz", "percent", 4000, ["queens", "brooklyn"], "individual", "ana"],
  ["Luis Fernández", "hourly", 2600, ["manhattan", "bronx"], "individual", "luis"],
  ["Grace Owusu", "percent", 4200, ["brooklyn"], "llc"],
  ["Mei Lin", "percent", 4000, ["queens", "manhattan"], "individual"],
  ["Dmitri Volkov", "percent", 3800, ["brooklyn", "staten_island"], "individual"],
  ["Fatima Diallo", "percent", 4000, ["bronx", "manhattan"], "individual"],
  ["Carlos Mendoza", "flat", 9000, ["queens"], "individual"],
  ["Priya Nair", "percent", 4500, ["manhattan"], "llc"],
  ["Joseph Kim", "hourly", 2800, ["manhattan", "queens"], "individual"],
  ["Sofia Rossi", "percent", 4000, ["staten_island", "brooklyn"], "individual"],
];
const subs: Sub[] = subSpecs.map(([name, payType, rate, boroughs, entity, login], i) => {
  const id = seedId(T.subs);
  const onboarding = name === "Sofia Rossi";
  add("subcontractors", {
    id, display_name: name, legal_name: entity === "llc" ? `${name.split(" ")[1]} Cleaning LLC` : name,
    business_entity: entity, email: `seed.${slug(name)}@example.com`, phone: fakePhone(pick(["718", "347", "929"])),
    status: onboarding ? "onboarding" : "active",
    boroughs_served: { raw: `'{${boroughs.join(",")}}'::public.borough[]` },
    pay_type: payType, pay_rate_bps: payType === "percent" ? rate : null, pay_rate_cents: payType === "percent" ? null : rate,
    payout_vendor_ref: onboarding ? null : `seed-vendor-${i + 1}`,
    w9_received_at: onboarding ? null : iso(nyToUtc(addDays(historyStart, -int(10, 200)), "10:00")),
    // A couple of insurance certificates expire soon, one already lapsed.
    coi_expires_on: onboarding ? null : i === 4 ? addDays(today, -3) : i === 6 || i === 8 ? addDays(today, int(5, 20)) : addDays(today, int(60, 300)),
    notes: null,
  });
  if (!onboarding) {
    for (const type of ["w9", "coi"] as const) {
      add("subcontractor_documents", { id: seedId(T.subDocs), subcontractor_id: id, type,
        storage_path: `${id}/${type}.pdf`, expires_on: null, uploaded_by: null });
    }
  }
  return { id, name, payType, boroughs, login };
});
const subByName = (n: string) => subs.find((s) => s.name === n) ?? fail(`no sub ${n}`);
const crews = {
  A: { id: seedId(T.crews), name: "Brooklyn Crew A", lead: "Grace Owusu", members: ["Grace Owusu", "Ana Ruiz", "Dmitri Volkov"] },
  B: { id: seedId(T.crews), name: "Queens Crew B", lead: "Mei Lin", members: ["Mei Lin", "Carlos Mendoza", "Ana Ruiz"] },
  C: { id: seedId(T.crews), name: "Manhattan & Commercial", lead: "Priya Nair", members: ["Priya Nair", "Luis Fernández", "Joseph Kim", "Fatima Diallo"] },
};
for (const c of Object.values(crews)) {
  add("crews", { id: c.id, name: c.name, lead_subcontractor_id: subByName(c.lead).id, is_active: true });
  for (const m of c.members) add("crew_members", { id: seedId(T.crewMembers), crew_id: c.id, subcontractor_id: subByName(m).id });
}
type CrewKey = keyof typeof crews;
const crewFor = (b: Borough): CrewKey => (b === "queens" ? "B" : b === "brooklyn" || b === "staten_island" ? "A" : "C");
const rotation: Record<CrewKey, number> = { A: 0, B: 0, C: 0 };
function crewPick(key: CrewKey, count: number): Sub[] {
  const members = crews[key].members.map(subByName);
  return Array.from({ length: count }, () => members[rotation[key]++ % members.length]).filter(
    (s, i, arr) => arr.findIndex((x) => x.id === s.id) === i,
  );
}

// Residential contacts, leads, activities
type Customer = { contactId: string; first: string; borough: Borough; propertyId?: string; bedrooms: number;
  bathrooms: number; won: boolean; quoteId?: string; leadCreated: Date; phone: string };
const customers: Customer[] = [];
const stagePlan = [...Array(35).fill("won"), ...Array(12).fill("quoted"), ...Array(10).fill("contacted"),
  ...Array(8).fill("new"), ...Array(15).fill("lost")] as string[];
const lostReasons = ["Price too high", "Went with another company", "No response after quote", "Only wanted same-day", "Outside service area"];
const accessNotes = ["Doorman building – keys at front desk", "Lockbox on gate, code 4417", "Client works from home; ring 3B",
  "Get key from the super in 1A", null, null, null];
for (const [i, stage] of stagePlan.entries()) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const borough = pickBorough();
  const addr = address(borough);
  const area = pick(BOROUGHS[borough].areas);
  const phone = fakePhone(area);
  const campaign = chance(0.65) ? pick(campaigns) : null;
  const source = campaign ? campaign.platform : chance(0.6) ? "referral" : "repeat";
  // New leads are recent; won leads are spread so their jobs fill the history.
  const daysAgo = stage === "new" ? int(0, 3) : stage === "won" ? int(30, 88) : int(4, 85);
  const created = nyToUtc(addDays(today, -daysAgo), `${String(int(7, 21)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}`);
  const contactId = seedId(T.contacts);
  const bedrooms = pick([0, 1, 1, 2, 2, 2, 3, 3, 4]);
  const bathrooms = bedrooms >= 3 ? pick([2, 2.5, 3]) : pick([1, 1, 1.5]);
  add("contacts", {
    id: contactId, type: "residential", first_name: first, last_name: last, phone,
    email: `${slug(first)}.${slug(last)}${i}@example.com`, address_line1: addr.line1, address_line2: chance(0.6) ? `Apt ${int(1, 9)}${pick(["A", "B", "C", "D"])}` : null,
    city: addr.city, state: "NY", zip: addr.zip, borough, source,
    utm_source: campaign?.utm ?? null, utm_medium: campaign ? "cpc" : null, utm_campaign: campaign ? campaign.ext : null,
    utm_term: null, utm_content: null, ghl_contact_id: null, stripe_customer_id: null, account_id: null, notes: null,
    created_at: iso(created),
  });
  const service = stage === "won" ? pick(["standard", "standard", "deep", "move"] as const) : pick(["standard", "deep", "move"] as const);
  const responseMinutes = chance(0.6) ? int(2, 15) : chance(0.75) ? int(16, 120) : int(121, 1440);
  const firstResponse = stage === "new" ? null : plusMinutes(created, responseMinutes);
  const leadId = seedId(T.leads);
  add("leads", {
    id: leadId, contact_id: contactId, service_id: svc[service].id, campaign_id: campaign?.id ?? null, bedrooms, bathrooms: String(bathrooms),
    sqft: 450 + bedrooms * 350 + int(0, 200), requested_date: addDays(nyDate(created), int(2, 10)), stage,
    first_response_at: firstResponse ? iso(firstResponse) : null, lost_reason: stage === "lost" ? pick(lostReasons) : null,
    source, ghl_opportunity_id: null, notes: null, created_at: iso(created),
  });
  add("activities", { id: seedId(T.activities), type: "note", direction: "inbound", subject: "Web form",
    body: `${svc[service].name} request, ${bedrooms}BR/${bathrooms}BA`, occurred_at: iso(created), actor_user_id: null,
    contact_id: contactId, lead_id: leadId, account_id: null, job_id: null, external_id: null });
  if (firstResponse) {
    add("activities", { id: seedId(T.activities), type: "sms", direction: "outbound", subject: null,
      body: `Hi ${first}, thanks for reaching out! Happy to get you a quote for a ${svc[service].name.toLowerCase()}.`,
      occurred_at: iso(firstResponse), actor_user_id: null, contact_id: contactId, lead_id: leadId, account_id: null,
      job_id: null, external_id: null });
  }
  if (stage === "lost") {
    add("activities", { id: seedId(T.activities), type: "status_change", direction: null, subject: "Marked lost",
      body: null, occurred_at: iso(plusMinutes(created, int(1500, 8000))), actor_user_id: null, contact_id: contactId,
      lead_id: leadId, account_id: null, job_id: null, external_id: null });
  }

  const customer: Customer = { contactId, first, borough, bedrooms, bathrooms, won: stage === "won", leadCreated: created, phone };
  if (stage === "won" || stage === "quoted") {
    const propertyId = seedId(T.properties);
    add("properties", { id: propertyId, contact_id: contactId, account_id: null, label: "Home", address_line1: addr.line1,
      address_line2: null, city: addr.city, state: "NY", zip: addr.zip, borough, sqft: 450 + bedrooms * 350,
      bedrooms, bathrooms: String(bathrooms), access_instructions: pick(accessNotes), is_active: true });
    customer.propertyId = propertyId;
  }
  if (stage === "won" || stage === "quoted" || (stage === "contacted" && chance(0.3))) {
    const quoteId = seedId(T.quotes);
    const status = stage === "won" ? "accepted" : stage === "contacted" ? "draft" : pick(["sent", "sent", "sent", "expired", "declined"]);
    const sentAt = plusMinutes(firstResponse ?? created, int(30, 600));
    add("quotes", {
      id: quoteId, lead_id: leadId, contact_id: contactId, account_id: null, property_id: customer.propertyId ?? null,
      status, discount_cents: 0, tax_cents: 0, valid_until: addDays(nyDate(sentAt), 14),
      sent_at: status === "draft" ? null : iso(sentAt), accepted_at: status === "accepted" ? iso(plusMinutes(sentAt, int(60, 2880))) : null,
      declined_at: status === "declined" ? iso(plusMinutes(sentAt, int(600, 4000))) : null, notes: null, created_by: null,
      created_at: iso(sentAt),
    });
    const base = homePrice(service, bedrooms, bathrooms);
    add("quote_items", { id: seedId(T.quoteItems), quote_id: quoteId, service_id: svc[service].id, description: svc[service].name,
      quantity: 1, unit_price_cents: Math.round(base / 500) * 500, sort_order: 0 });
    if (chance(0.4)) {
      add("quote_items", { id: seedId(T.quoteItems), quote_id: quoteId, service_id: null, description: pick(["Inside fridge", "Inside oven", "Interior windows"]),
        quantity: 1, unit_price_cents: pick([3500, 3500, 6000]), sort_order: 1 });
    }
    if (status === "accepted" && chance(0.3)) postInsert.push(`update public.quotes set discount_cents = 2000 where id = '${quoteId}';`);
    customer.quoteId = quoteId;
  }
  customers.push(customer);
}

// Commercial accounts
type Acct = { id: string; name: string; industry: string; status: string; borough: Borough; days?: string; price: number; contactId?: string; propertyId?: string };
const accounts: Acct[] = [
  { id: seedId(T.accounts), name: "Gowanus Dental Studio", industry: "Healthcare", status: "active", borough: "brooklyn", days: "MO,TH", price: 28000 },
  { id: seedId(T.accounts), name: "Astoria Yoga Collective", industry: "Fitness", status: "active", borough: "queens", days: "TU,FR", price: 24000 },
  { id: seedId(T.accounts), name: "Hudson Yards Design Partners", industry: "Professional services", status: "active", borough: "manhattan", days: "TU,TH", price: 42000 },
  { id: seedId(T.accounts), name: "Fordham Road Pediatrics", industry: "Healthcare", status: "prospect", borough: "bronx", price: 30000 },
  { id: seedId(T.accounts), name: "Bay Ridge Coworking", industry: "Coworking", status: "prospect", borough: "brooklyn", price: 36000 },
  { id: seedId(T.accounts), name: "Riverdale Montessori", industry: "Education", status: "paused", borough: "bronx", price: 34000 },
  { id: seedId(T.accounts), name: "St. George Law Group", industry: "Legal", status: "churned", borough: "staten_island", price: 26000 },
  { id: seedId(T.accounts), name: "Long Island City Brewing Co.", industry: "Hospitality", status: "prospect", borough: "queens", price: 38000 },
];
for (const [i, a] of accounts.entries()) {
  const visits = a.days ? a.days.split(",").length * 4 : 8;
  add("accounts", {
    id: a.id, name: a.name, industry: a.industry, status: a.status,
    walkthrough_at: a.status === "prospect" ? iso(nyToUtc(addDays(today, i % 2 === 0 ? int(2, 9) : -int(3, 20)), "11:00")) : iso(nyToUtc(addDays(historyStart, -int(20, 120)), "11:00")),
    monthly_value_cents: a.price * visits, visits_per_month: visits, payment_terms: "net_30",
    renewal_date: a.status === "active" ? addDays(today, int(60, 300)) : null, primary_contact_id: null,
    stripe_customer_id: null, notes: null,
  });
  const first = pick(FIRST);
  const last = pick(LAST);
  const contactId = seedId(T.contacts);
  const addr = address(a.borough);
  add("contacts", {
    id: contactId, type: "commercial", first_name: first, last_name: last, phone: fakePhone(pick(BOROUGHS[a.borough].areas)),
    email: `${slug(first)}.${slug(last)}@example.com`, address_line1: addr.line1, address_line2: null, city: addr.city,
    state: "NY", zip: addr.zip, borough: a.borough, source: "referral", utm_source: null, utm_medium: null, utm_campaign: null,
    utm_term: null, utm_content: null, ghl_contact_id: null, stripe_customer_id: null, account_id: a.id,
    notes: "Office manager", created_at: iso(nyToUtc(addDays(historyStart, -int(5, 60)), "12:00")),
  });
  postInsert.push(`update public.accounts set primary_contact_id = '${contactId}' where id = '${a.id}';`);
  a.contactId = contactId;
  if (a.status === "active") {
    const propertyId = seedId(T.properties);
    add("properties", { id: propertyId, contact_id: null, account_id: a.id, label: "Main office", address_line1: addr.line1,
      address_line2: `Suite ${int(2, 12)}00`, city: addr.city, state: "NY", zip: addr.zip, borough: a.borough,
      sqft: int(1800, 6000), bedrooms: null, bathrooms: null, access_instructions: "After-hours entry with fob; alarm code from office manager",
      is_active: true });
    a.propertyId = propertyId;
  }
  if (a.status === "active" || a.status === "prospect") {
    const quoteId = seedId(T.quotes);
    const sentAt = nyToUtc(addDays(a.status === "active" ? historyStart : today, -int(5, 25)), "15:00");
    add("quotes", {
      id: quoteId, lead_id: null, contact_id: contactId, account_id: a.id, property_id: a.propertyId ?? null,
      status: a.status === "active" ? "accepted" : "sent", discount_cents: 0, tax_cents: 0, valid_until: addDays(nyDate(sentAt), 30),
      sent_at: iso(sentAt), accepted_at: a.status === "active" ? iso(plusMinutes(sentAt, 2880)) : null, declined_at: null,
      notes: `${visits} visits/month`, created_by: null, created_at: iso(sentAt),
    });
    add("quote_items", { id: seedId(T.quoteItems), quote_id: quoteId, service_id: svc.office.id, description: "Office cleaning (per visit)",
      quantity: visits, unit_price_cents: a.price, sort_order: 0 });
  }
}

// Recurring series and jobs
type Job = { id: string; date: string; start: Date; end: Date; price: number; serviceKey: keyof typeof svc; minutes: number;
  contactId: string | null; accountId: string | null; propertyId: string; crew: CrewKey; status: string; commercial: boolean };
const jobs: Job[] = [];
function addJob(j: Omit<Job, "id" | "status"> & { seriesId: string | null; quoteId: string | null }) {
  const id = seedId(T.jobs);
  const past = j.end.getTime() < now.getTime();
  const status = past ? (chance(0.9) ? "completed" : chance(0.5) ? "cancelled" : "no_access") : "scheduled";
  add("jobs", {
    id, series_id: j.seriesId, quote_id: j.quoteId, contact_id: j.contactId, account_id: j.accountId, property_id: j.propertyId,
    service_id: svc[j.serviceKey].id, crew_id: crews[j.crew].id, scheduled_start: iso(j.start), scheduled_end: iso(j.end),
    status, price_cents: j.price, completed_at: status === "completed" ? iso(j.end) : null, completed_by: null,
    cancellation_reason: status === "cancelled" ? pick(["Client rescheduled", "Client traveling", "Building closed"]) : null,
    notes: null, crew_notes: status === "no_access" ? "No one home, buzzer not answered" : j.commercial ? "Empty trash and recycling in every office" : null,
    external_id: null, ghl_appointment_id: null,
  });
  jobs.push({ ...j, id, status });
}
function expandWeekly(start: string, until: string, byday: string[], interval: number): string[] {
  const out: string[] = [];
  const startWeek = addDays(start, -weekday(start));
  for (let d = start; d <= until; d = addDays(d, 1)) {
    const weeks = Math.floor((Date.parse(addDays(d, -weekday(d))) - Date.parse(startWeek)) / (7 * 86400000));
    if (weeks % interval === 0 && byday.includes(DOW[weekday(d)])) out.push(d);
  }
  return out;
}
function addSeries(opts: { contactId: string | null; accountId: string | null; propertyId: string; serviceKey: keyof typeof svc;
  byday: string[]; interval: number; time: string; minutes: number; price: number; crew: CrewKey; commercial: boolean }) {
  const id = seedId(T.series);
  const start = addDays(historyStart, int(0, 10));
  const rule = `FREQ=WEEKLY${opts.interval > 1 ? `;INTERVAL=${opts.interval}` : ""};BYDAY=${opts.byday.join(",")}`;
  add("job_series", {
    id, contact_id: opts.contactId, account_id: opts.accountId, property_id: opts.propertyId, service_id: svc[opts.serviceKey].id,
    default_crew_id: crews[opts.crew].id, recurrence_rule: rule, start_date: start, end_date: null, local_start_time: opts.time,
    duration_minutes: opts.minutes, price_cents: opts.price, is_active: true, generated_through: horizon, notes: null,
  });
  for (const date of expandWeekly(start, horizon, opts.byday, opts.interval)) {
    const s = nyToUtc(date, opts.time);
    addJob({ seriesId: id, quoteId: null, date, start: s, end: plusMinutes(s, opts.minutes), price: opts.price,
      serviceKey: opts.serviceKey, minutes: opts.minutes, contactId: opts.contactId, accountId: opts.accountId,
      propertyId: opts.propertyId, crew: opts.crew, commercial: opts.commercial });
  }
}
for (const a of accounts.filter((x) => x.status === "active")) {
  addSeries({ contactId: null, accountId: a.id, propertyId: a.propertyId ?? fail("no property"), serviceKey: "office",
    byday: (a.days ?? "MO").split(","), interval: 1, time: "18:30", minutes: 180, price: a.price, crew: crewFor(a.borough), commercial: true });
}
const won = customers.filter((c) => c.won);
for (const c of won.slice(0, 7)) {
  const interval = pick([1, 2, 2]);
  addSeries({ contactId: c.contactId, accountId: null, propertyId: c.propertyId ?? fail("no property"), serviceKey: "standard",
    byday: [pick(["MO", "TU", "WE", "TH", "FR", "SA"])], interval, time: pick(["09:00", "10:00", "13:00"]), minutes: 150,
    price: Math.round(homePrice("standard", c.bedrooms, c.bathrooms) / 500) * 500, crew: crewFor(c.borough), commercial: false });
}
for (const [i, c] of won.slice(7).entries()) {
  const kind = i < 3 ? "airbnb" : pick(["deep", "move", "standard", "deep"] as const);
  const visits = kind === "airbnb" ? int(5, 8) : chance(0.35) ? 2 : 1;
  const firstDay = Math.max(-85, -Math.floor((now.getTime() - c.leadCreated.getTime()) / 86400000) + int(2, 8));
  for (let v = 0; v < visits; v++) {
    const date = addDays(today, Math.min(firstDay + v * int(7, 21), 40));
    const s = nyToUtc(date, kind === "airbnb" ? "11:00" : pick(["09:00", "10:00", "12:00", "14:00"]));
    const minutes = svc[kind].minutes;
    addJob({ seriesId: null, quoteId: v === 0 ? c.quoteId ?? null : null, date, start: s, end: plusMinutes(s, minutes),
      price: Math.round(homePrice(kind, c.bedrooms, c.bathrooms) / 500) * 500, serviceKey: kind, minutes,
      contactId: c.contactId, accountId: null, propertyId: c.propertyId ?? fail("no property"), crew: crewFor(c.borough), commercial: false });
  }
}

// Assignments (cancelled and no-access visits have none)
type Assignment = { id: string; jobId: string; subId: string; date: string };
const assignments: Assignment[] = [];
for (const j of jobs) {
  if (j.status === "cancelled" || j.status === "no_access") continue;
  const count = j.commercial || j.serviceKey === "deep" || j.serviceKey === "move" ? 2 : 1;
  for (const s of crewPick(j.crew, count)) {
    const id = seedId(T.assignments);
    add("job_assignments", { id, job_id: j.id, subcontractor_id: s.id,
      minutes_worked: s.payType === "hourly" && j.status === "completed" ? j.minutes + int(-15, 30) : null });
    assignments.push({ id, jobId: j.id, subId: s.id, date: j.date });
  }
}

// Invoices and payments
let paymentSeq = 0;
const completed = jobs.filter((j) => j.status === "completed");
function addInvoice(opts: { contactId: string | null; accountId: string | null; issued: string; due: string; lines: Job[] }) {
  const id = seedId(T.invoices);
  const total = opts.lines.reduce((s, j) => s + j.price, 0);
  const overdueCutoff = addDays(today, -7);
  const paid = opts.due < addDays(today, -5) ? chance(0.92) : opts.issued < addDays(today, -2) && chance(0.6);
  const status = paid ? "paid" : "open";
  const receivedOn = addDays(opts.issued, int(0, 4));
  add("invoices", {
    id, contact_id: opts.contactId, account_id: opts.accountId, status, issued_on: opts.issued, due_on: opts.due, tax_cents: 0,
    stripe_invoice_id: null, stripe_hosted_invoice_url: null, sent_at: iso(nyToUtc(opts.issued, "17:00")),
    paid_at: paid ? iso(nyToUtc(receivedOn, "12:00")) : null, voided_at: null,
    notes: !paid && opts.due < overdueCutoff ? "Overdue – reminder sent" : null,
  });
  for (const [i, j] of opts.lines.entries()) {
    add("invoice_line_items", { id: seedId(T.invoiceItems), invoice_id: id, job_id: j.id,
      description: `${svc[j.serviceKey].name} – ${j.date}`, quantity: 1, unit_price_cents: j.price, sort_order: i });
  }
  if (paid) {
    add("payments", { id: seedId(T.payments), invoice_id: id, amount_cents: total, status: "succeeded",
      method: opts.accountId ? "ach" : "card", stripe_payment_intent_id: `pi_seed_${String(++paymentSeq).padStart(6, "0")}`,
      stripe_charge_id: null, received_at: iso(nyToUtc(receivedOn, "12:00")), refunded_at: null, notes: null });
  }
}
const invoiceQueue: { issued: string; fn: () => void }[] = [];
for (const j of completed.filter((x) => !x.commercial && x.date < addDays(today, -1))) {
  invoiceQueue.push({ issued: j.date, fn: () => addInvoice({ contactId: j.contactId, accountId: null, issued: j.date, due: j.date, lines: [j] }) });
}
const currentMonth = today.slice(0, 7);
for (const a of accounts.filter((x) => x.status === "active")) {
  const byMonth = new Map<string, Job[]>();
  for (const j of completed.filter((x) => x.accountId === a.id && x.date.slice(0, 7) < currentMonth)) {
    byMonth.set(j.date.slice(0, 7), [...(byMonth.get(j.date.slice(0, 7)) ?? []), j]);
  }
  for (const [month, lines] of byMonth) {
    const issued = addDays(`${month}-01`, 32).slice(0, 7) + "-01";
    invoiceQueue.push({ issued, fn: () => addInvoice({ contactId: a.contactId ?? null, accountId: a.id, issued, due: addDays(issued, 30), lines }) });
  }
}
// Issue in date order so invoice numbers read chronologically.
invoiceQueue.sort((x, y) => x.issued.localeCompare(y.issued)).forEach((q) => q.fn());

// Biweekly payouts (Mon-Sun periods): older periods paid, the latest one a draft.
let lastSunday = addDays(today, -1);
while (weekday(lastSunday) !== 0) lastSunday = addDays(lastSunday, -1);
const payoutItemValues: string[] = [];
const paidPayoutIds: string[] = [];
let vendorRef = 0;
for (let k = 0; ; k++) {
  const end = addDays(lastSunday, -14 * k);
  const start = addDays(end, -13);
  if (start < historyStart) break;
  for (const s of subs) {
    const items = assignments.filter((a) => a.subId === s.id && a.date >= start && a.date <= end &&
      completed.some((j) => j.id === a.jobId));
    if (items.length === 0) continue;
    const payoutId = seedId(T.payouts);
    add("payouts", { id: payoutId, subcontractor_id: s.id, period_start: start, period_end: end, status: "draft",
      payout_vendor_ref: k === 0 ? null : `seed-po-${++vendorRef}`, notes: null });
    for (const a of items) payoutItemValues.push(`('${seedId(T.payoutItems)}', '${payoutId}', '${a.id}')`);
    if (k > 0) paidPayoutIds.push(payoutId);
  }
}

// Vendors and expenses
const vendors = [
  { id: seedId(T.vendors), name: "Gowanus Janitorial Supply", category: "supplies" },
  { id: seedId(T.vendors), name: "Northern Blvd Cleaning Wholesale", category: "supplies" },
  { id: seedId(T.vendors), name: "Vac & Steam Repair LIC", category: "equipment" },
  { id: seedId(T.vendors), name: "Brightline Scheduling Software", category: "software" },
  { id: seedId(T.vendors), name: "Harbor Mutual Insurance Agency", category: "insurance" },
] as const;
for (const v of vendors) {
  add("vendors", { id: v.id, name: v.name, category: v.category, email: `billing@${slug(v.name)}.example.com`,
    phone: fakePhone("718"), notes: null, is_active: true });
}
for (let i = 0; i < 30; i++) {
  const v = pick([vendors[0], vendors[0], vendors[1], vendors[1], vendors[2], vendors[3], vendors[4]]);
  const amount = v.category === "supplies" ? int(4500, 32000) : v.category === "equipment" ? int(8000, 45000) : v.category === "software" ? 9900 : 48500;
  add("expenses", { id: seedId(T.expenses), vendor_id: v.id, category: v.category,
    description: v.category === "supplies" ? pick(["Microfiber cloths and mop heads", "Concentrated all-purpose cleaner", "Trash bags and gloves", "Glass cleaner and squeegees"]) :
      v.category === "equipment" ? pick(["HEPA vacuum repair", "Steam cleaner parts"]) : v.category === "software" ? "Monthly scheduling subscription" : "General liability premium",
    amount_cents: amount, incurred_on: addDays(today, -int(1, 89)), job_id: null, receipt_path: null, created_by: null });
}
for (let i = 0; i < 6; i++) {
  add("expenses", { id: seedId(T.expenses), vendor_id: null, category: "transit", description: "Crew subway/bus fares (OMNY)",
    amount_cents: int(2900, 8700), incurred_on: addDays(today, -int(1, 89)), job_id: null, receipt_path: null, created_by: null });
}

// Automations (disabled), opt-outs, goals
for (const a of [
  { name: "Review request after completed job", event: "job.completed", actions: [{ type: "send_sms", template: "review_request", delay_minutes: 120 }] },
  { name: "Speed-to-lead text", event: "lead.created", actions: [{ type: "send_sms", template: "lead_ack", delay_minutes: 0 }] },
  { name: "Overdue invoice reminder", event: "invoice.overdue", actions: [{ type: "send_email", template: "invoice_reminder", delay_minutes: 0 }] },
]) {
  add("automations", { id: seedId(T.automations), name: a.name, trigger_event: a.event,
    conditions: { raw: "'{}'::jsonb" }, actions: { raw: `${lit(JSON.stringify(a.actions))}::jsonb` }, is_enabled: false, created_by: null });
}
for (const c of customers.filter((x) => !x.won).slice(0, 3)) {
  add("opt_outs", { id: seedId(T.optOuts), channel: "sms", value: c.phone, source: "stop_keyword", reason: "Replied STOP" });
}
// The owner's real monthly targets (they carry the seed id prefix, so the
// purge removes them along with the demo data).
const monthStart = `${currentMonth}-01`;
const monthEnd = addDays(addDays(monthStart, 32).slice(0, 7) + "-01", -1);
for (const g of [
  { metric: "google_reviews", period: "month", start: monthStart, end: monthEnd, target: 15 },
  { metric: "residential_jobs_completed", period: "month", start: monthStart, end: monthEnd, target: 25 },
  { metric: "commercial_contracts_signed", period: "month", start: monthStart, end: monthEnd, target: 1 },
]) {
  add("goals", { id: seedId(T.goals), metric: g.metric, period: g.period, period_start: g.start, period_end: g.end,
    target_value: g.target, notes: null, created_by: null });
}

// ---------------------------------------------------------------- SQL assembly

const SEED_TABLES = ["services", "marketing_campaigns", "marketing_daily_stats", "accounts", "contacts", "properties", "leads",
  "activities", "quotes", "quote_items", "subcontractors", "crews", "crew_members", "subcontractor_documents", "job_series",
  "jobs", "job_assignments", "invoices", "invoice_line_items", "payments", "payouts", "payout_items", "vendors", "expenses",
  "automations", "opt_outs", "goals"] as const;

const countsJson = `json_build_object(${SEED_TABLES.map((t) => `'${t}', (select count(*) from public.${t} where id::text like '${SEED_PREFIX}%')`).join(", ")},
  'profiles', (select count(*) from public.profiles where user_id in (select id from auth.users where email like 'seed+%@example.com')),
  'invoiced_cents', (select coalesce(sum(total_cents), 0) from public.invoices where id::text like '${SEED_PREFIX}%'),
  'collected_cents', (select coalesce(sum(amount_paid_cents), 0) from public.invoices where id::text like '${SEED_PREFIX}%'),
  'payouts_paid_cents', (select coalesce(sum(total_cents), 0) from public.payouts where id::text like '${SEED_PREFIX}%' and status = 'paid'),
  'payouts_draft_cents', (select coalesce(sum(total_cents), 0) from public.payouts where id::text like '${SEED_PREFIX}%' and status = 'draft'))`;

function buildSeedSql(logins: { key: string; userId: string; email: string; name: string }[], dryRun: boolean): string {
  const loginRows = logins.map((l) => {
    const sub = subs.find((s) => s.login === l.key) ?? fail(`no sub for login ${l.key}`);
    return { user_id: l.userId, role: "subcontractor", full_name: l.name, phone: null, subcontractor_id: sub.id, is_active: true } satisfies Row;
  });
  const order = ["services", "marketing_campaigns", "marketing_daily_stats", "accounts", "contacts"] as const;
  const parts = [
    `-- Generated by scripts/seed.mts for ${CLEANING_PROJECT_REF} on ${today} (America/New_York).`,
    "do $seed$",
    "begin",
    `  if exists (select 1 from public.services where id::text like '${SEED_PREFIX}%')
     or exists (select 1 from public.contacts where id::text like '${SEED_PREFIX}%')
     or exists (select 1 from auth.users where email like 'seed+%@example.com' and id not in (${logins.map((l) => lit(l.userId)).join(", ") || "null"})) then
    raise exception 'seed rows already exist; run --purge first';
  end if;`,
    ...(dryRun
      ? [insertSqlRaw("auth.users", logins.map((l) => ({ id: l.userId, email: l.email, aud: "authenticated", role: "authenticated",
          raw_user_meta_data: { raw: `'{"seed": true}'::jsonb` } })))]
      : []),
    ...order.map((t) => insertSql(t, rows[t] ?? [])),
    ...postInsert.filter((s) => s.includes("accounts")),
    ...["properties", "leads", "activities", "quotes", "quote_items"].map((t) => insertSql(t, rows[t] ?? [])),
    ...postInsert.filter((s) => s.includes("quotes")),
    ...["subcontractors"].map((t) => insertSql(t, rows[t] ?? [])),
    insertSql("profiles", loginRows),
    ...["crews", "crew_members", "subcontractor_documents", "job_series", "jobs", "job_assignments", "invoices",
      "invoice_line_items", "payments", "payouts"].map((t) => insertSql(t, rows[t] ?? [])),
    payoutItemValues.length
      ? `insert into public.payout_items (id, payout_id, job_assignment_id, amount_cents)
select v.id::uuid, v.payout_id::uuid, a.id, a.pay_cents
from (values\n  ${payoutItemValues.join(",\n  ")}\n) as v (id, payout_id, assignment_id)
join public.job_assignments a on a.id = v.assignment_id::uuid;`
      : "",
    paidPayoutIds.length
      ? `update public.payouts set status = 'approved' where id in (${paidPayoutIds.map(lit).join(", ")});
update public.payouts set status = 'paid' where id in (${paidPayoutIds.map(lit).join(", ")});`
      : "",
    ...["vendors", "expenses", "automations", "opt_outs", "goals"].map((t) => insertSql(t, rows[t] ?? [])),
    dryRun ? `  raise exception 'SEED_DRY_RUN_OK %', ${countsJson};` : "",
    "end",
    "$seed$;",
  ];
  return parts.filter(Boolean).join("\n\n");
}
// auth.users isn't in public; tiny variant of insertSql for the dry-run placeholders.
function insertSqlRaw(table: string, data: Row[]): string {
  return insertSql("__placeholder__", data).replace("public.__placeholder__", table);
}

function buildPurgeSql(): string {
  const deleteOrder = ["payout_items", "payouts", "payments", "invoice_line_items", "invoices", "expenses", "vendors",
    "job_photos", "activities", "job_assignments", "jobs", "job_series", "quote_items", "quotes", "leads",
    "subcontractor_documents", "crew_members", "crews"];
  const afterProfiles = ["subcontractors", "properties", "contacts", "accounts", "marketing_daily_stats",
    "marketing_campaigns", "services", "automation_runs", "automations", "opt_outs", "goals"];
  const del = (t: string) => `  delete from public.${t} where id::text like '${SEED_PREFIX}%';`;
  return `do $purge$
declare
  fk record;
  n bigint;
  offenders text := '';
begin
  -- Refuse if any real row points at a seed row (including optional links
  -- that would otherwise be silently cleared by ON DELETE SET NULL).
  for fk in
    select c.conrelid::regclass as child, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
  loop
    if fk.child = 'public.profiles'::regclass then
      execute format('select count(*) from public.profiles x where x.%I::text like ''${SEED_PREFIX}%%'' and x.user_id not in (select id from auth.users where email like ''seed+%%@example.com'')', fk.col) into n;
    else
      execute format('select count(*) from %s x where x.%I::text like ''${SEED_PREFIX}%%'' and x.id::text not like ''${SEED_PREFIX}%%''', fk.child, fk.col) into n;
    end if;
    if n > 0 then
      offenders := offenders || format('%s.%s (%s rows); ', fk.child, fk.col, n);
    end if;
  end loop;
  if offenders <> '' then
    raise exception 'purge refused: real rows reference seed rows: %', offenders;
  end if;

  -- Seed payouts include approved/paid ones, which the payout rules protect.
  -- Disable those two guards for this transaction only; any error rolls the
  -- disable back too.
  alter table public.payouts disable trigger payouts_guard_status;
  alter table public.payout_items disable trigger payout_items_guard;

  update public.accounts set primary_contact_id = null where id::text like '${SEED_PREFIX}%';
${deleteOrder.map(del).join("\n")}
  delete from public.profiles where user_id in (select id from auth.users where email like 'seed+%@example.com');
${afterProfiles.map(del).join("\n")}

  alter table public.payouts enable trigger payouts_guard_status;
  alter table public.payout_items enable trigger payout_items_guard;

  -- If nothing real was ever numbered, restart numbering at 1.
  if not exists (select 1 from public.invoices) then
    alter table public.invoices alter column invoice_number restart with 1;
  end if;
  if not exists (select 1 from public.quotes) then
    alter table public.quotes alter column quote_number restart with 1;
  end if;
end
$purge$;`;
}

// ---------------------------------------------------------------- execution

function runSql(sql: string): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "seed-"));
  const file = join(dir, "query.sql");
  writeFileSync(file, sql);
  try {
    const res = spawnSync("scripts/supabase-cleaning.sh", ["db", "query", "-f", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    return { ok: res.status === 0 && !/ERROR:/.test(output), output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function errorLine(output: string): string {
  return /ERROR:[^"\\]*/.exec(output)?.[0] ?? output.slice(-800);
}

const admin = createClient(supabaseUrl, env.data.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function findSeedUsers() {
  const found: { id: string; email: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`listing users failed: ${error.message}`);
    const users = z.array(z.object({ id: z.string(), email: z.string().optional(), user_metadata: z.record(z.string(), z.unknown()).optional() }))
      .parse(data.users);
    if (users.length === 0) break;
    for (const u of users) {
      if (u.email && /^seed\+[a-z]+@example\.com$/.test(u.email) && u.user_metadata?.seed === true) found.push({ id: u.id, email: u.email });
    }
  }
  return found;
}

function summary() {
  const count = (t: string) => (rows[t] ?? []).length;
  const statusCount = (s: string) => jobs.filter((j) => j.status === s).length;
  const invoiceRows = rows.invoices ?? [];
  console.log(`Seed for ${CLEANING_PROJECT_REF}, anchored to ${today} (America/New_York); history from ${historyStart}, visits through ${horizon}.\n`);
  console.log("Rows to insert:");
  for (const t of SEED_TABLES) console.log(`  ${t.padEnd(24)} ${t === "payout_items" ? payoutItemValues.length : count(t)}`);
  console.log(`  ${"profiles (test logins)".padEnd(24)} ${TEST_LOGINS.length}`);
  console.log(`\nJobs: ${statusCount("completed")} completed, ${statusCount("scheduled")} scheduled, ${statusCount("cancelled")} cancelled, ${statusCount("no_access")} no access`);
  console.log(`Invoices: ${invoiceRows.filter((r) => r.status === "paid").length} paid, ${invoiceRows.filter((r) => r.status === "open").length} open`);
  console.log(`Payouts: ${paidPayoutIds.length} paid, ${(rows.payouts ?? []).length - paidPayoutIds.length} draft (latest period)`);
  const bySource = new Map<string, number>();
  for (const c of rows.contacts ?? []) bySource.set(String(c.source), (bySource.get(String(c.source)) ?? 0) + 1);
  console.log(`Contact sources: ${[...bySource].map(([s, n]) => `${s} ${n}`).join(", ")}`);
  console.log(`Goals: ${(rows.goals ?? []).map((g) => `${g.metric} ${g.target_value}/${g.period} (${g.period_start}..${g.period_end})`).join("; ")}`);
  const sampleJob = jobs.find((j) => j.status === "scheduled" && !j.commercial);
  if (sampleJob) console.log(`Sample visit: ${sampleJob.date} ${svc[sampleJob.serviceKey].name}, starts ${iso(sampleJob.start)} UTC, $${(sampleJob.price / 100).toFixed(2)}`);
}

if (values.purge) {
  const res = runSql(buildPurgeSql());
  if (!res.ok) fail(`purge failed, nothing removed: ${errorLine(res.output)}`);
  const seedUsers = await findSeedUsers();
  for (const u of seedUsers) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) fail(`seed rows removed, but deleting login ${u.email} failed: ${error.message}`);
  }
  console.log(`Purge complete: all ${SEED_PREFIX}* rows removed and ${seedUsers.length} test login(s) deleted.`);
} else if (values["dry-run"]) {
  const placeholderLogins = TEST_LOGINS.map((l, i) => ({ key: l.key, email: l.email, name: l.name,
    userId: `${SEED_PREFIX}ffff-4000-8000-${String(i + 1).padStart(12, "0")}` }));
  const sql = buildSeedSql(placeholderLogins, true);
  if (values.out) writeFileSync(values.out, sql);
  summary();
  console.log(`\nSQL: ${(sql.length / 1024).toFixed(0)} KB${values.out ? `, written to ${values.out}` : ""}`);
  console.log("\nValidating against the database inside a transaction that always rolls back...");
  const res = runSql(sql);
  const ok = /SEED_DRY_RUN_OK (\{.*?\})/.exec(res.output.replace(/\\"/g, '"'));
  if (!ok) fail(`dry run failed: ${errorLine(res.output)}`);
  console.log("Dry run OK. Counts the database reported before rolling back:");
  console.log(JSON.stringify(JSON.parse(ok[1]), null, 2));
} else {
  if ((await findSeedUsers()).length > 0) fail("seed test logins already exist; run --purge first");
  const created: { key: string; userId: string; email: string; name: string; password: string }[] = [];
  for (const l of TEST_LOGINS) {
    const password = randomBytes(18).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email: l.email, password, email_confirm: true,
      user_metadata: { seed: true, full_name: l.name } });
    if (error || !data.user) {
      for (const c of created) await admin.auth.admin.deleteUser(c.userId);
      fail(`creating ${l.email} failed: ${error?.message ?? "no user returned"}`);
    }
    created.push({ key: l.key, userId: data.user.id, email: l.email, name: l.name, password });
  }
  const res = runSql(buildSeedSql(created, false));
  if (!res.ok) {
    for (const c of created) await admin.auth.admin.deleteUser(c.userId);
    fail(`seed failed and was rolled back (test logins removed): ${errorLine(res.output)}`);
  }
  summary();
  const counts = runSql(`select ${countsJson} as counts;`);
  console.log(`\nDatabase counts: ${/\{[^{}]*"services"[^{}]*\}/.exec(counts.output.replace(/\\"/g, '"'))?.[0] ?? "(see table)"}`);
  console.log("\nSubcontractor test logins (passwords shown once, not stored anywhere):");
  for (const c of created) console.log(`  ${c.email}  ${c.password}`);
}
