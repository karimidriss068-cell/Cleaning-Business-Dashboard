/**
 * One-time bootstrap: gives an existing Supabase Auth user the owner profile.
 *
 *   node scripts/bootstrap-owner.mts --project-ref lijsaulkeaqlriwqgxty \
 *     --email you@example.com --name "Your Name"
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Refuses unless --project-ref names the cleaning project AND matches the URL
 * in .env.local, refuses the archived MAKI project outright, and refuses if
 * any owner already exists, so it can't silently run twice.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const CLEANING_PROJECT_REF = "lijsaulkeaqlriwqgxty";
const MAKI_PROJECT_REF = "dpmgeqxwufqcwboprckw";

function fail(message: string): never {
  console.error(`bootstrap-owner: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    "project-ref": { type: "string" },
    email: { type: "string" },
    name: { type: "string" },
  },
});

const args = z
  .object({
    projectRef: z.literal(CLEANING_PROJECT_REF),
    email: z.email().transform((e) => e.toLowerCase()),
    name: z.string().trim().min(1),
  })
  .safeParse({ projectRef: values["project-ref"], email: values.email, name: values.name });

if (!args.success) {
  fail(
    `invalid arguments. Required: --project-ref ${CLEANING_PROJECT_REF} --email <login email> --name <full name>\n` +
      JSON.stringify(z.flattenError(args.error).fieldErrors),
  );
}

try {
  process.loadEnvFile(".env.local");
} catch {
  fail("could not read .env.local (run from the repo root)");
}

const env = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  })
  .safeParse(process.env);
if (!env.success) fail("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

const url = env.data.NEXT_PUBLIC_SUPABASE_URL;
if (url.includes(MAKI_PROJECT_REF)) fail("refusing to run against the archived MAKI project");
if (url !== `https://${args.data.projectRef}.supabase.co`) {
  fail(`.env.local points at ${url}, not project ${args.data.projectRef}`);
}

const supabase = createClient(url, env.data.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Find the auth user by email (paged; the admin API has no email filter).
const userSchema = z.object({ id: z.uuid(), email: z.string().optional() });
let userId: string | null = null;
for (let page = 1; userId === null; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) fail(`listing users failed: ${error.message}`);
  const users = z.array(userSchema).parse(data.users);
  if (users.length === 0) break;
  userId = users.find((u) => u.email?.toLowerCase() === args.data.email)?.id ?? null;
}
if (!userId) fail(`no Supabase Auth user with email ${args.data.email}; create it in the dashboard first`);

const profileRows = z.array(z.object({ user_id: z.uuid(), role: z.string() }));

const owners = await supabase.from("profiles").select("user_id, role").eq("role", "owner");
if (owners.error) fail(`reading profiles failed: ${owners.error.message}`);
if (profileRows.parse(owners.data).length > 0) fail("an owner profile already exists; bootstrap is one-time only");

const existing = await supabase.from("profiles").select("user_id, role").eq("user_id", userId);
if (existing.error) fail(`reading profiles failed: ${existing.error.message}`);
const [current] = profileRows.parse(existing.data);
if (current) fail(`this user already has a ${current.role} profile`);

const inserted = await supabase
  .from("profiles")
  .insert({ user_id: userId, role: "owner", full_name: args.data.name })
  .select("user_id, role");
if (inserted.error) fail(`insert failed: ${inserted.error.message}`);

console.log(`Owner profile created for ${args.data.email} (${userId}) on ${args.data.projectRef}.`);
