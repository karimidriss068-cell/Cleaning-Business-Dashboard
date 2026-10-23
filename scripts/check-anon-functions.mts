/**
 * Verifies that a logged-out visitor (anon key) can't execute any database
 * function. Run after every migration that adds or changes functions:
 *
 *   node scripts/check-anon-functions.mts --project-ref lijsaulkeaqlriwqgxty
 *
 * 1. Lists every RPC PostgREST exposes (OpenAPI spec read with the service
 *    role key) and calls each one with the anon key, using dummy arguments of
 *    the right types. Each call must fail with a permission error.
 * 2. Confirms the anon key's own OpenAPI spec lists no RPCs at all.
 * 3. Calls every private.* function named in supabase/migrations through
 *    the private schema, which must be rejected because PostgREST doesn't expose it.
 *
 * Exits non-zero if any call succeeds. Refuses unless --project-ref names
 * the cleaning project and matches NEXT_PUBLIC_SUPABASE_URL in .env.local.
 */
import { readdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";

const CLEANING_PROJECT_REF = "lijsaulkeaqlriwqgxty";
const MAKI_PROJECT_REF = "dpmgeqxwufqcwboprckw";

function fail(message: string): never {
  console.error(`check-anon-functions: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({ options: { "project-ref": { type: "string" } } });
if (values["project-ref"] !== CLEANING_PROJECT_REF) {
  fail(`pass --project-ref ${CLEANING_PROJECT_REF} explicitly`);
}

try {
  process.loadEnvFile(".env.local");
} catch {
  fail("could not read .env.local (run from the repo root)");
}
const env = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  })
  .safeParse(process.env);
if (!env.success) fail("Supabase URL or keys missing from .env.local");
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey } = env.data;
if (url.includes(MAKI_PROJECT_REF)) fail("refusing to run against the archived MAKI project");
if (url !== `https://${CLEANING_PROJECT_REF}.supabase.co`) fail(`.env.local points at ${url}, not ${CLEANING_PROJECT_REF}`);

const propertySchema = z.object({ type: z.string().optional(), format: z.string().optional() }).loose();
const openApiSchema = z.object({
  paths: z.record(
    z.string(),
    z
      .object({
        post: z
          .object({
            parameters: z
              .array(
                z
                  .object({
                    // Table endpoints use $ref parameters with no "in"; RPCs inline a body param.
                    in: z.string().optional(),
                    schema: z.object({ properties: z.record(z.string(), propertySchema).optional() }).loose().optional(),
                  })
                  .loose(),
              )
              .optional(),
          })
          .loose()
          .optional(),
      })
      .loose(),
  ),
});

async function openApi(key: string) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
  });
  return { status: res.status, spec: res.ok ? openApiSchema.parse(await res.json()) : null };
}

function dummyValue(p: z.infer<typeof propertySchema>): unknown {
  const format = p.format ?? "";
  if (format === "uuid") return randomUUID();
  if (format === "date") return "2026-01-01";
  if (format.startsWith("timestamp")) return "2026-01-01T00:00:00Z";
  if (p.type === "integer" || p.type === "number") return 1;
  if (p.type === "boolean") return false;
  return "x";
}

async function callAsAnon(name: string, args: Record<string, unknown>, schema?: string) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      ...(schema ? { "Content-Profile": schema } : {}),
    },
    body: JSON.stringify(args),
  });
  const body = z.object({ code: z.string().optional(), message: z.string().optional() }).loose().safeParse(await res.json().catch(() => ({})));
  return { status: res.status, code: body.success ? body.data.code : undefined };
}

let failures = 0;
function report(ok: boolean, label: string, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
}

// 1. Every exposed RPC must be denied to anon.
const service = await openApi(serviceKey);
if (!service.spec) fail(`OpenAPI fetch with the service role key failed (HTTP ${service.status})`);
const rpcs = Object.entries(service.spec.paths).filter(([path]) => path.startsWith("/rpc/"));
for (const [path, item] of rpcs) {
  const name = path.slice("/rpc/".length);
  const props = item.post?.parameters?.find((p) => p.in === "body")?.schema?.properties ?? {};
  const args = Object.fromEntries(Object.entries(props).map(([k, p]) => [k, dummyValue(p)]));
  const { status, code } = await callAsAnon(name, args);
  report(status === 401 || status === 403, `public.${name}`, `HTTP ${status} ${code ?? ""}`.trim());
}
if (rpcs.length === 0) console.log("info  no public RPCs exposed yet");

// 2. anon's own spec must list no RPCs. Publishable keys may be refused the
// spec entirely (401/403), which also means nothing is listed to them.
const anon = await openApi(anonKey);
if (anon.spec) {
  const anonRpcs = Object.keys(anon.spec.paths).filter((p) => p.startsWith("/rpc/"));
  report(anonRpcs.length === 0, "anon OpenAPI lists no RPCs", anonRpcs.length ? anonRpcs.join(", ") : "none listed");
} else {
  report(anon.status === 401 || anon.status === 403, "anon OpenAPI lists no RPCs", `spec refused, HTTP ${anon.status}`);
}

// 3. private.* functions must be unreachable through the API.
const privateFns = new Set<string>();
for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))) {
  const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
  for (const m of sql.matchAll(/create function private\.([a-z_]+)\s*\(/g)) privateFns.add(m[1]);
}
for (const name of [...privateFns].sort()) {
  const { status, code } = await callAsAnon(name, {}, "private");
  report(status >= 400, `private.${name}`, `HTTP ${status} ${code ?? ""}`.trim());
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed: anon can't execute any function.");
process.exit(failures ? 1 : 0);
