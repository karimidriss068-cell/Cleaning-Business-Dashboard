# CLAUDE.md

This repo is being **fully converted into a single-business platform for a residential and commercial cleaning company in NYC** that uses 1099 subcontractors. The conversion covers a new brand, a new design, and a new schema on a **brand-new Supabase project**. There is no multi-tenancy.

The app was previously MAKI Ops, a med-spa marketing dashboard. **MAKI is archived on branch `archive/maki-ops-final`.** Don't restore, maintain, or keep compatibility with MAKI features on this branch. Where MAKI code helps (Supabase clients, `webhook-auth.ts`, UI primitives), reuse it. Everything else is replaced as the conversion proceeds.

## Hard rule: never touch the MAKI database

- The live MAKI Supabase project (`maki-ops`, ref `dpmgeqxwufqcwboprckw`) **must never be touched from this branch.**
- **Never** run migrations, SQL, type generation, advisors, or any Supabase MCP command against it, not even reads.
- Run database work **only against the new cleaning project, once the user provides its URL.** Until then, don't run any database commands.
- Every Supabase command (MCP, CLI, or type generation) must name the cleaning project ref `lijsaulkeaqlriwqgxty` explicitly, for example via `project_id`, `--project-ref`, or `--project-id`. Never rely on a default or linked project. If `.env.local`, a linked CLI project, or the MCP connection points at `dpmgeqxwufqcwboprckw`, stop and tell the user.
- The files currently in `supabase/migrations/` are MAKI's schema. Don't apply them to the new project. The cleaning schema starts fresh.

## Stack

- **Next.js 16** (App Router, React 19, Turbopack). The route guard lives in `src/proxy.ts`, Next 16's name for middleware.
- **TypeScript**, `strict: true`. Path alias `@/*` points to `src/*`.
- **Supabase**: Postgres, Auth (email + password), and RLS, on the new cleaning project (ref `lijsaulkeaqlriwqgxty`). Uses `@supabase/ssr`.
- **Tailwind v4**, configured in CSS (`src/app/globals.css`, `@theme inline`). There is no `tailwind.config`.
- **shadcn/ui on the Base UI registry** (`style: base-nova`), not Radix. Compose with `render={<Button />}` instead of `asChild`. `Select` needs an `items` map.
- **Recharts** for charts, **framer-motion** for reveals, **sonner** for toasts, and **lucide-react** for icons.
- **zod v4** for validation.
- Deploys to Vercel. Cron jobs are in `vercel.json`.

## Layout

```
src/
  proxy.ts                    session refresh + redirect to /login (UX only, not a security boundary)
  app/(app)/...               authenticated pages; layout.tsx calls getUser() and renders the shell
  app/api/webhooks/*          inbound webhooks + cron (service-role client)
  components/ui/*             shadcn primitives. Regenerate with the shadcn CLI; don't hand-fork them
  components/forms/*          dialogs and forms
  lib/*                       domain logic, one file per feature
  lib/supabase/{server,client,admin,middleware}.ts
  lib/supabase/database.types.ts   generated; never hand-edit
  lib/webhook-auth.ts         timing-safe header and signature checks
supabase/migrations/          schema source of truth (currently MAKI's; see the hard rule above)
```

## Supabase clients: which one to use

| Client | File | When |
|---|---|---|
| Server (user session, RLS applies) | `@/lib/supabase/server` | Server Components, Server Actions, route handlers with a logged-in user. **The default.** |
| Browser (user session, RLS applies) | `@/lib/supabase/client` | Reads in client components only. Do writes through Server Actions so input can be validated with zod. |
| Admin (service role, **bypasses RLS**) | `@/lib/supabase/admin` | Only webhooks, cron, and public token pages, and only after the caller is authenticated another way. Never import it from a client component. |

On the server, check the user with `auth.getUser()`, not `getSession()`. The proxy uses `getSession()` only to keep navigation fast.

## Conventions

- Pages are async Server Components that fetch with `Promise.all`, map the rows into typed view models, and pass them to client components. Each page has a sibling `loading.tsx`.
- Colors and fonts come only from the tokens in `globals.css`, never from ad-hoc hex values. The tokens will be replaced with the new brand.
- Forms show field errors with `FieldError`. Report results with `toast.success` / `toast.error`, then call `router.refresh()`.
- Route handlers set `export const runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- Domain logic goes in `src/lib/<feature>.ts` as pure functions that take a `SupabaseClient<Database>`, so it can be tested.
- Comments explain *why*. Match the existing comment density.
- User-facing copy speaks cleaning-business language. Remove med-spa and ad-agency wording when you touch a screen.

## Run

```bash
npm install
cp .env.example .env.local      # fill in values for the NEW cleaning Supabase project only
npm run dev                     # http://localhost:3000
```

Every env var is documented in `.env.example`. When you add a variable, add it there with a comment saying where its value comes from.

## Test / verify

There is **no test runner yet** (see the to-do below). Until one exists, run these before every commit:

```bash
npx tsc --noEmit                # must pass
npm run lint                    # 12 errors already exist; don't add new ones
npm run build
```

Once Vitest is set up, every new table ships with RLS tests and every webhook ships with tests covering a bad signature, a duplicate event, and invalid input.

## Adding a migration (new cleaning project only)

1. Write `supabase/migrations/<YYYYMMDDHHMMSS>_<snake_name>.sql`. Enable RLS and add policies in the same migration that creates a table.
2. Confirm the target is the cleaning project's ref, **never** `dpmgeqxwufqcwboprckw`. Then apply the migration with the Supabase MCP `apply_migration` or `supabase db push`. The file's timestamp must match the version Supabase records. If the tool assigns a different one, rename the file.
3. Regenerate the types:
   `supabase gen types typescript --project-id lijsaulkeaqlriwqgxty > src/lib/supabase/database.types.ts`
4. Run the Supabase security and performance advisors, and fix any new findings: missing RLS, mutable `search_path`, unindexed foreign keys.
5. Commit the migration and the regenerated types together.

## Rules

### 1. External webhooks verify signatures and are idempotent

- Read the **raw body** once (`await req.text()`), verify it, then parse it.
- Verify the provider's signature (HMAC or public key) with `timingSafeEqual`. Reject timestamps older than 5 minutes where the provider sends one. Put the helpers in `src/lib/webhook-auth.ts`.
- If a provider can't sign, use a dedicated secret header for that endpoint and require a unique event id in the payload. Document the weaker guarantee in the route's comment.
- Idempotency: insert into `webhook_events (provider, event_id, received_at, payload_hash)` with a unique `(provider, event_id)` **before** doing any side effects. If the insert hits the conflict, return `200 { duplicate: true }`. Also put natural unique keys on domain rows (for example, a unique external job id) so retries upsert instead of duplicating.
- Return 2xx only after the write commits, and 5xx on transient failure so the provider retries. Outbound sends (SMS, payouts) claim the work atomically with `update ... where sent_at is null returning` before sending, so concurrent runs can't send twice.
- Don't log raw payloads or PII (names, phones, addresses, TINs). Log ids only.

### 2. No secrets in code

- Secrets live in `.env.local` and Vercel env vars only. Add every new variable name to `.env.example` with an empty value.
- Server-only secrets never get a `NEXT_PUBLIC_` prefix, and modules that read them are never imported by client components. Add `import "server-only"` to any new server-only module.
- Don't store subcontractor TINs or SSNs, or bank details, in plain Postgres columns. Use the payroll or payout vendor's vault and keep only its reference id.

### 3. TypeScript strict and zod at every boundary

- No `any`, and no `as` casts on external input.
- Every route handler, Server Action, webhook, and cron entry point parses its input with a zod schema (`schema.safeParse`) and returns `400` with the flattened issues. Parse responses from external APIs with zod too.
- Keep each schema next to its handler, or in `src/lib/schemas/<feature>.ts` if it's shared, and infer types from it with `z.infer`.

### 4. Money in integer cents

- Store every money amount as an integer number of cents (`bigint` or `integer` columns named `*_cents`, such as `price_cents` or `payout_cents`). Never use `numeric`, `float`, or a JS float for stored amounts.
- Do all arithmetic in cents. Convert to dollars only for display, in one formatting helper in `src/lib/format.ts`. Zod schemas for money inputs use integer cents (`z.number().int()`), or parse dollar strings into cents at the boundary.

### 5. Time: store UTC, display America/New_York

- Store timestamps as `timestamptz`. They are in UTC both in the database and in transit.
- Display every date and time in `America/New_York` through shared helpers in `src/lib/format.ts` (`Intl.DateTimeFormat` with `timeZone: "America/New_York"`). Never rely on the server's or browser's local timezone.
- Compute day boundaries (such as "today's jobs" or weekly payout periods) in `America/New_York`, then convert them to UTC for queries. Watch DST transitions.

## To-do

- [ ] Set up **Vitest** (`npm test`) for `src/lib/**` and the webhook handlers.
- [ ] Add a **CI step** that runs `tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` on every push and PR.
- [ ] Fix the **12 existing lint errors**: impure `Date.now()` during render in the accounts, campaigns, and dashboard pages; unescaped entities in `not-found.tsx` and `meta-campaign-id-form.tsx`; and setState-in-effect in `insights-chat.tsx` and `use-count-up.ts`.
- [ ] Show a **"Demo data loaded, purge before launch" banner** in the app shell whenever any row with an id starting `5eed0000-` exists (demo data from `scripts/seed.mts`).
- [ ] **Run the purge before real customers go in**: `node scripts/seed.mts --project-ref lijsaulkeaqlriwqgxty --purge`. It also removes the seeded goals and the two test logins (`seed+ana@example.com`, `seed+luis@example.com`); re-enter the real goals afterwards.
