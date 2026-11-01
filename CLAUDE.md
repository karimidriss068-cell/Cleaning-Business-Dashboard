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
  app/api/webhooks/*          inbound webhooks (stripe) + cron (service-role client)
  app/(public)/{pay,card}/[token]   customer pay and save-card pages: no login, the link's token is the credential
  app/(print)/invoices/[id]/print   printable invoice outside the shell
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
- Forms show field errors inline next to the field. Report results with `toast.success` / `toast.error`, then call `router.refresh()`.
- Route handlers set `export const runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- Domain logic goes in `src/lib/<feature>.ts` as pure functions that take a `SupabaseClient<Database>`, so it can be tested.
- Comments explain *why*. Match the existing comment density.
- User-facing copy speaks cleaning-business language. Remove med-spa and ad-agency wording when you touch a screen.

## Crew (subcontractor) rules

- A cleaner never reads office tables. They get only the `crew_*` functions and `my_jobs`/`complete_job` (definer bodies in the `private` schema behind invoker wrappers), their own `job_cleaner_notes`, and photos on visits they're assigned to. **They must never see billing, CRM data (contacts, phones, emails, last names), other cleaners' pay, or payouts.**
- New crew features follow the same pattern: add the data to a `crew_*` function that returns only the caller's own rows and columns, extend `supabase/tests/12_crew_view.sql` and `e2e/crew.mjs` to prove what stays hidden, and never add a crew-readable policy on an office table.
- Office pages live in `src/app/(app)/(office)/`, crew pages in `(crew)/`; the group layouts redirect the wrong role. Crew screens use the crew sizes in DESIGN.md (17px body, 48px+ targets, 56px primary actions, `text-crew-muted` for AAA contrast).

## Leads & Pipeline rules

- Stored stages stay `new, contacted, quoted, won, lost`; the app says New, Contacted, Quote sent, Booked, Lost (`stageLabel` in `src/lib/leads.ts`). Sources and service types are fixed lists (`leads_source_check`, `lead_service_type`).
- Every change goes through a function in one transaction that writes the lead's timeline: `create_lead`, `move_lead_stage`, `update_lead`, `convert_lead` (customer + draft quote, idempotent), plus `find_lead_duplicates` and `lead_conversion_by_source`. Do not update `leads` stages or insert leads from app code directly. Error codes: KC001 stale, KC004 not allowed, KC005 bad input, KC010 duplicate contact.
- Phones are stored E.164 (`+1XXXXXXXXXX`, `normalizeUsPhone` mirrors `private.normalize_us_phone`); emails lowercase. Duplicates are matched on those.
- Office roles only (RLS + `(office)` route group); cleaners get nothing, proven in `supabase/tests/13_leads_pipeline.sql` and `e2e/leads.mjs`.
- `leads.external_id` holds the GoHighLevel opportunity id (written only by `ghl_upsert_lead`; see the GoHighLevel rules). Do not add other CRM syncs without being asked.
- The board holds its own state after load, so lead actions do not `revalidatePath("/leads")` (it would remount the board and close an open lead); only `createLead` does.

## Invoices & Payouts rules

- **Writes only through functions.** `invoices`, `invoice_line_items`, `payments`, `refunds`, `payouts`, `payout_items`, `business_settings`, `finance_log`, `payment_methods`, `card_requests` and `subcontractor_documents` are read-only to signed-in users (no write grants, no write policies). Every change is a `private.*` SECURITY DEFINER function behind a thin `public.*` invoker wrapper: role check first (`require_admin`), one transaction, a `finance_log` row. Staff can read invoices; only owner/admin change anything; payouts, 1099 data and W-9s are owner/admin only. Error codes: KC001 stale, KC004 not allowed or wrong state, KC005 bad input, KC010 already exists.
- **Optional function arguments need `default null`.** The API leaves out what the caller didn't send, and a function whose optional args have no default is then "not found". Also no bare `UPDATE`/`DELETE` in a function: the API role refuses a statement without `WHERE`. The SQL tests run as the table owner and miss both, so the browser test (`npm run e2e:finance`) is what catches them.
- **Invoices:** one live invoice per job (partial unique index on non-voided lines; voiding frees the job) and per quote. Lines freeze when the invoice leaves draft; void is final and needs no payments (record refunds first). Status (sent, partially paid, paid, overdue) is recomputed by a trigger from payments minus refunds; overdue is also derived at display from the NY due date, and `/api/cron/invoice-overdue` stores it daily. Sales tax is **off by default**: per-line `taxable`, a rate in **parts per million** (8.875% = 88750) snapshotted on the invoice at creation, math mirrored in `src/lib/invoices.ts` (tested against the SQL).
- **Payments:** Stripe in **test mode only** (`assertTestModeKey` refuses a live key). `src/lib/stripe.ts` is the only code that reads the secret key. The signed webhook (`/api/webhooks/stripe`) claims the event in `webhook_events` first, then writes through `stripe_*` functions that are idempotent on Stripe ids; those and `invoice_for_pay_token` are granted to `service_role` only. Manual payments (cash, Zelle, check, ACH) carry a reference (required for Zelle and check) and a client `request_id`, so a double click records once. Refunds are **recorded, never initiated**. Cards on file store only Stripe ids and display details.
- **Payouts are recorded, never sent.** Weekly Mon-Sun (NY) batches per cleaner from the pay snapshot on each assignment. A visit is payable only when its invoice is **paid or marked collected** (`private.payout_core` gives the reason when it isn't, shown on Payouts). Draft -> approved (frozen: items and pay can't change) -> paid with a method and reference. A visit joins at most one live payout; visits that miss a week carry to the next. Approval re-checks eligibility.
- **1099:** per cleaner per calendar year by the date the payout was marked paid. The threshold is a setting (`form_1099_threshold_cents`, default $2,000 as a placeholder): never hard-code it, and tell the owner to confirm the figure with their accountant. W-9s live in the private `subcontractor-documents` bucket, owner/admin only; no TIN is stored in a column. CSV cells are formula-escaped (`csvCell`).
- **Cleaners** see only their own approved/paid weeks through `crew_payouts()` (date, service, amount), never clients, invoices or other cleaners; proven in `supabase/tests/14_invoices_payouts.sql`, `12_crew_view.sql` and the e2e files.
- Demo data: seeded invoices/payouts keep the `5eed0000-` prefix; `--purge` also removes invoices, payments, refunds, payouts and finance log made while testing on demo records, plus W-9 files in storage.

## Growth goal rules

- **Where the pieces live.** The plan, assumptions and cash settings are one row in `growth_settings` (read-only to signed-in users). The monthly milestones are rows in the existing `goals` table (`revenue_cents`, `month`), replaced together by `save_growth_plan` (six months, never decreasing, the last equal to residential + commercial). Daily ad spend reuses `marketing_campaigns` / `marketing_daily_stats` and is **typed in by hand: nothing calls the Meta API**. A lead whose source is Instagram/Meta, Google or Thumbtack is attached to that platform's newest active **non-demo** campaign by a trigger when it has none.
- **Writes only through functions** (`save_growth_plan`, `save_growth_assumptions`, `save_cash_settings`, `create_ad_campaign`, `record_ad_spend`, `delete_ad_spend`): `require_admin`, one transaction, a `finance_log` row (`entity = 'growth'`). Staff read; cleaners get nothing. One spend figure per campaign per day: entering a day again replaces it.
- **One copy of the rules.** The database only gathers raw numbers (`private.growth_core`, New York days and months); pace, ad metrics, capacity, cash and the scale light are pure functions in `src/lib/growth.ts`, covered by `growth.test.ts`. Cash includes payouts, so it and the scale light are `null` for staff.
- **Revenue** for pace is invoiced (sent or later, before tax, after discount) plus completed visits not yet on a sent invoice, by New York month. Pace is straight-line inside the month; "days ahead" is the gap divided by a day's share of the milestone, and ±2 days is "on track".
- **Scale light:** green only if median lead reply is under target, capacity is under 80%, CAC payback is under 3 months and cash stays above the buffer after the rest of this month's ad budget. A failing condition is red, a close one or missing data is amber, and each blocker is named. CAC uses the real cost per booked client only from 3 bookings in 30 days, else the assumption.
- **Bots:** `GET /api/growth/snapshot` (Bearer `GROWTH_API_KEY`) returns the whole snapshot as JSON through the service-role-only `growth_inputs_for_bots()`. It is read-only by construction (GET only, one reading function). Roast Room, Agents and the voice AI poll it; they cannot edit anything.
- **Growth part 2 (the 12-month north star).** Tiers (Base $50k revenue, Strong $100k revenue, North star $50k net profit, all editable) share one ramp shaped by the revenue the gates ask for at months 3, 6 and 9 (`rampShares`); the tracked tier sets the pace, the other two stay visible. **Profit** = revenue (as for pace) minus the cleaners' pay snapshot on visits completed that month, ad spend and `expenses`; it is owner/admin only, so staff get `null`. Expenses reuse the existing table, now owner/admin only and written through `record_expense` / `delete_expense` (don't enter cleaner pay or ad spend as expenses; cash uses the fixed-costs setting, not expenses). The forecast replaces churn on top of the clients each tier needs.
- **Gates and decisions.** `growth_gate_criteria` (editable thresholds, `enabled`), `growth_hire_triggers` and `growth_decisions` are read-only to users and changed through `save_gate_criteria`, `save_hire_triggers`, `add_growth_decision`. A gate is passed (all criteria met, even early), missed (its day has arrived and one isn't) or on track. Cost to win a client and payback only count from 3 real bookings. Hidden-from-staff criteria (margin) never fail a gate for staff.
- **Channels and funnel.** `channel` (meta, google_search, google_lsa, referral, organic, other) lives on campaigns, ad spend (copied from its campaign by a trigger) and leads (derived on insert from the campaign or source; staff correct it, with the creative, from the lead). Funnel stages are leads, contacted (replied or past New), quote sent, booked, first clean done, became recurring (a series exists); counts are the last 90 days of leads against the same days' spend. Churn is residential cancellations divided by recurring clients at the start of the month.
- **Channel test.** Rules (judge after $750 and 20 leads, loser at 1.5x the best cost per booked client, $20/day week 1 then $30/day, 4 weeks) are editable. `recommend` only recommends. **A planned test whose remaining spend would take cash under the buffer cannot be saved**: enforced in `save_channel_test` (SQL, via `private.growth_cash_on_hand`) and mirrored in `testBudgetCheck` for the form. Decisions are logged by the owner/admin, never automatically.
- **Demo data** (ids starting `5eed0000-`) is labeled "Includes demo data" on the card and page and "Demo" on ad rows; the purge removes the rows. Plan, settings and milestones are real configuration and are not purged.

## GoHighLevel rules

- **A separate GHL sub-account for this business.** Its location id, token and webhook secret are `GHL_LOCATION_ID`, `GHL_API_TOKEN` and `GHL_WEBHOOK_SECRET` in `.env.local` and Vercel; the owner sets them, never paste or log them. The MAKI sub-account's values must never be used here. `src/lib/ghl/client.ts` is the only code that reads the token; errors carry a status, never a body.
- **Webhooks are notifications only.** `POST /api/webhooks/ghl` checks the `x-ghl-webhook-secret` header (32+ characters, constant-time), reads the raw body once, parses it with zod (`event`, `eventId`, `sentAt`, one id), enforces a 5 minute replay window, claims `eventId` in `webhook_events` (a repeat answers `200 {duplicate:true}`), then **re-fetches the record from GHL by id** and acts on that. The payload never carries data we write. This is the weaker "dedicated secret header" guarantee from rule 1; the fetch-by-id design is what makes it safe.
- **One write path.** Webhook and the reconciliation (`/api/cron/ghl-sync`, every 5 minutes, reconciles at most every 10) call the same service-role functions: `ghl_upsert_lead` (matches the GHL id, then the normalized phone, then the email; UTM sets channel, campaign and creative; the new lead gets a "Call this lead now" activity and a follow-up today), `ghl_apply_stage` (no echo back to GHL), `ghl_log_message` (unique on the GHL message id; a STOP reply opts the number out; the first **human** outbound text sets `first_response_at`, automated templates do not), `ghl_log_appointment`, `ghl_refresh_contact`. They are `service_role` only, so signed-in users cannot call them.
- **Outbound.** A trigger queues `update_opportunity` in `sync_queue` when a stage changes in the app (the worker reads the lead's current stage). Texts come from `ghl_due_messages` (instant reply, booking confirmation, 24-hour reminder, review request 2 hours after completion, payment link); `ghl_claim_message` claims each one before anything is sent (unique `dedupe_key`) and refuses without `contacts.sms_consent` or to a number in `opt_outs`. Quiet hours (8am to 9pm New York), per-contact and hourly limits and dry-run live in `src/lib/ghl/send-rules.ts`, one tested copy. Waiting leaves no log row, so the next run asks again.
- **Dry-run is the default for every template and for stage updates.** Dry-run writes what it would send to `message_log` and sends nothing. Switching a template to live is an owner/admin action on `/settings/integrations` that needs a second confirming press; a live message must contain "STOP". Consent is explicit: set from the lead drawer by staff or from the `sms-consent` tag in GHL; GHL do-not-disturb and STOP replies always win.
- **Reliability.** Failures retry through `ghl_queue_fail` (30s doubling to 6h, dead after 8 tries) and show on `/settings/integrations` and the Command Center "GoHighLevel sync" card (owner/admin). A failed webhook event is re-claimed when GHL redelivers it. Optional function arguments need `default null`, and optional ones must come last (a migration fixed `ghl_claim_message`).
- **Tests.** `src/lib/ghl/*.test.ts` and `src/app/api/webhooks/ghl/route.test.ts` (signature, replay, duplicate, opt-out, quiet hours, DST, dry-run, rate limit, retry), `supabase/tests/17_ghl.sql` (dedupe, consent, STOP, RLS, anon), and `npm run e2e:ghl`, which starts a fake GHL and the app, then signs in as temporary `seed+e2eghl-` users it deletes. The fake numbers are `+1332555019x`; the script refuses if anyone owns them (the upsert matches people by phone).

## Public lead form rules

- **One path.** The website form (`/lead-form`, embedded with `<script src="<app url>/embed.js" async></script>`, which frames it and passes the host page's address and `utm_*` tags) posts to `POST /api/public/leads`. That calls the service-role-only `intake_lead`, which calls `private.create_lead_core`, the same body staff `create_lead` uses (duplicate matching is `private.lead_duplicates`, shared with `find_lead_duplicates`). Change lead creation in the core, not in a copy.
- **Duplicates look like new leads.** The visitor always gets the same thank-you, so the form can't be used to look people up. A known phone or email reuses the contact: an open lead gets a "Sent the website form again" note, otherwise a new lead is opened. Either way a call-now task is created.
- **Consent is evidence.** Ticking the box writes a `consent_records` row (date, source `web_form`, the wording and its version, page, hashed address). The wording is the server's copy in `src/lib/intake.ts` for the version the page shows; change the wording and bump `CONSENT_VERSION`, and an old page is told to reload. `contacts.sms_consent` is switched on only for a brand-new contact whose number hasn't replied STOP; an existing contact is never flipped by an anonymous form (the row is kept with `applied = false` for staff to confirm). Unticked: the lead is still taken, no consent, no texts.
- **Abuse defenses**, in order, in `src/lib/intake-server.ts`: size and JSON type, strict zod schema (unknown fields refused), per-address limit (6 per 10 minutes, counted before the bot traps), hidden-field and too-fast traps (answered like a success, nothing stored), Cloudflare Turnstile verified server-side, per-person limit (3 per hour on the phone or email), a site-wide breaker (300 per hour). Limits live in `intake_rate_hit` (table `intake_hits`, server only) and fail closed. In production the form refuses to run without `TURNSTILE_SECRET_KEY`, the site key and `INTAKE_IP_SALT`. Addresses are stored only as an HMAC with that salt.
- **No secrets in the browser.** Only the Turnstile site key is public. Logs carry error codes, never names, phones or emails. The embed allow-list is `INTAKE_EMBED_ORIGINS` (any site when empty). `x-real-ip` is trusted for the rate limit because Vercel sets it.
- **Test numbers.** Tests and e2e use `+1332555xxxx` and refuse to run if a real or demo contact owns one: the 718/212/917 555 numbers collide with the demo data.

## AI spend rules

- **Every AI call goes through `callModel()`** (`src/lib/ai/call-model.ts`, server-only). Any new AI feature (Roast Room, `/agents`, voice, anything later) must use it; never call a provider's API or SDK directly, and never read a provider key anywhere else. ESLint enforces this (`no-restricted-imports` / `no-restricted-syntax` outside `src/lib/ai/`). Pass a `feature` (lowercase slug), an `actor` (`user`, `bot` or `system` with an id), a `model` from `src/lib/ai/pricing.ts`, and `maxTokens` (required, lowered to 8192 at most). Use `cacheSystem` for a long, repeated system prompt.
- **Reserve, send, settle.** `callModel` holds the worst-case cost with `ai_reserve` (kill switch first, then every cap that applies, all under one lock, so a cap can never be overshot), sends, then `ai_settle`s the real cost from the provider's own token counts. A refusal or provider failure costs nothing and surfaces as `AiRefusedError` (reasons: `kill_switch`, `budget`, `not_configured`, `bad_request`) or `AiProviderError`; callers must handle both and show a plain message. Holds older than 10 minutes expire.
- **Money.** Cost is kept in micros (millionths of a dollar, `ai_usage.cost_micros`); `cost_cents` is that rounded up. Prices are whole cents per million tokens in `pricing.ts`, the only copy, and are **placeholders to confirm** against each provider's pricing page. A model not listed there can't be called.
- **Caps** (`ai_budgets`): scopes global, feature, bot, user; daily and monthly in New York time, each optional, with `hard_stop` (off = alert only). A row keyed `*` is the default for each feature, bot or person separately; a named row overrides it. Defaults: global $2/day and $20/month, `board` $1/day and $10/month, each bot $0.50/day and $5/month. Only the owner edits caps and the kill switch (`save_ai_budget`, `delete_ai_budget`, `set_ai_kill_switch`, logged to `finance_log`, entity `ai`); owner/admin read; `ai_reserve`/`ai_settle`/`ai_fail` are `service_role` only. `/settings/ai-usage` is owner only. The 80% alert (page and Command Center banner) is owner only; the rule is `budgetAlerts` in `src/lib/ai/budget.ts`.
- **Keys.** `CLEANING_ANTHROPIC_API_KEY` and `XAI_API_KEY`, set by the owner in `.env.local` and Vercel. The older `ANTHROPIC_API_KEY` in `.env.local` belongs to MAKI: never read or use it. Also set the provider-side monthly limits as a backstop (Anthropic Console -> Settings -> Limits, in a workspace of its own for this app; xAI Console -> Billing -> spend limit or prepaid credits), a little above the global cap.
- **No content is stored or logged**: only counts, model, feature, actor and cost. Tests use fake providers only (`src/lib/ai/*.test.ts`, `npm run e2e:ai`); `AI_ANTHROPIC_BASE` / `AI_XAI_BASE` point at a fake on this machine and are ignored otherwise.

## UI rules (Keystone Clean design system)

- **Read `DESIGN.md` before building UI.** All values come from `src/config/brand.ts`, the only place colors, fonts, effects and scales are defined.
- **Use the token system only.** That means the Tailwind names mapped in `src/app/globals.css` (`bg-surface`, `text-ink-muted`, `border-hairline`, `text-brand-text`, `bg-success-soft`, `shadow-e1`, `glass`, `surface-layer`, `kc-enter`, `tabular`, …). No hex values, no inline colors, and no direction-specific branches.
- **Every new screen and component must work in all three directions (Titanium & Ice, Deep Ocean & Aqua, Midnight & Periwinkle) and in both dark and light.** Check each of the 6 combinations at desktop (1440px) and phone (390px) widths before committing: no overflow, readable text, correct direction and theme. Crew screens must stay at AAA contrast.
- **New colors go in `brand.ts` for all three directions and both themes.** `npm test` then runs the contrast, hue-distance and no-gold checks (`src/config/brand.test.ts`) for every combination; a failing pair blocks the change.
- **Glass and motion (DESIGN.md section 4b).** Panels, sections and tiles use `<GlassPanel level>` (or `Card`); never compose your own background, border and shadow. Pick `card` (default), `popover`, `modal`, `sidebar`, `flat` (items repeated in a list, no blur) or `solid` (crew screens and dense boards). Keep blurred panels few per screen. Text must pass contrast on glass over the worst-case backdrop (`brand.test.ts`); changing `glassSpec` or an accent re-runs it.
- **Numbers that matter animate:** KPIs, money and counts use `<AnimatedNumber>` (money as integer cents) or `StatTile`'s `figure`. Every chart uses `AreaChart`, `BarChart` or `Sparkline`, which draw in, ease on change and show tooltips; pass `format` as a name. Cards that move between lanes or stages use `kc-settle`; loading states use `Skeleton` / `kc-shimmer`. Animate opacity and transform only (no layout shifts), and every effect must be instant under `prefers-reduced-motion`.
- **Status is never color alone:** use `StatusPill` and the mappings in `src/lib/status.ts`.
- **Motion:** use the duration and easing tokens, play once, and stay correct under `prefers-reduced-motion`.
- **Appearance is a per-user preference** (`user_preferences`, Settings → Appearance). Don't hard-code a direction or theme anywhere.

## Run

```bash
npm install
cp .env.example .env.local      # fill in values for the NEW cleaning Supabase project only
npm run dev                     # http://localhost:3000
```

Every env var is documented in `.env.example`. When you add a variable, add it there with a comment saying where its value comes from.

## Test / verify

Run these before every commit. CI (`.github/workflows/ci.yml`) runs the same on every push to `main` or `cleaning-platform` and on every PR:

```bash
npm run typecheck               # tsc --noEmit, must pass
npm run lint                    # must pass with 0 errors
npm test                        # Vitest: src/**/*.test.ts
npm run build
```

- Unit tests live next to the code (`src/lib/format.test.ts`). Anything touching dates must pass under any machine time zone; CI also runs the suite with `TZ=Pacific/Kiritimati`.
- Database behavior (RLS, triggers, functions) is tested by the rolled-back SQL files in `supabase/tests/`. Trial-run a new migration together with its test inside `begin; … rollback;` before applying it.
- Browser end-to-end for leads: `npm run e2e:leads` (see `e2e/leads.mjs`; needs `STAFF_EMAIL`/`STAFF_PASSWORD` for an office login and optionally `CREW_EMAIL`/`CREW_PASSWORD`). Covers drag, Lost reason, Move sheet, quick add, duplicate warning, convert and the cleaner lockout, then restores everything.
- Browser end-to-end for invoices and payouts: `npm run e2e:finance` (see the header of `e2e/finance.mjs`; needs an admin, a staff and a cleaner login, plus `STRIPE_WEBHOOK_SECRET` matching the server's). Creates a visit, invoices it, takes a deposit, a signed Stripe webhook and a payout through approval and paid, checks 1099/CSV/W-9, staff and cleaner lockout, then removes everything.
- Browser end-to-end for the growth goal: `npm run e2e:growth` (see the header of `e2e/growth.mjs`; needs an admin, a staff and a cleaner login and the server started with `GROWTH_API_KEY`). Edits assumptions and milestones, adds an expense, switches the tier, views the channel test and tries a plan that breaches the buffer, corrects a lead's channel, adds a campaign, enters, replaces and deletes ad spend, turns the scale light red via the cash buffer, checks staff/cleaner lockout and the bot endpoint, then restores everything.
- Browser end-to-end for GoHighLevel: `npm run e2e:ghl` (needs a build; see the header of `e2e/ghl.mjs`). No GHL account, logins or env values needed: it uses a fake GHL and creates and removes its own temporary users.
- Browser end-to-end for the public lead form: `npm run e2e:intake` (see the header of `e2e/intake.mjs`; needs no logins, starts a fake Turnstile). Covers the endpoint without sign-in, consent evidence, duplicates, missing consent, bad input, bot traps, both rate limits, the embed script, and every direction x theme at 1440px and 390px; removes everything it adds.
- Browser end-to-end for AI spend control: `npm run e2e:ai` (needs a build; see the header of `e2e/ai.mjs`). No provider keys or logins: it fires 40 concurrent reservations at a small cap, flips the kill switch, and drives `/settings/ai-usage` as a temporary owner; it restores the caps it touches.
- Browser end-to-end for the crew view: `npm run e2e:crew` (see `e2e/crew.mjs`) signs in as a real cleaner on a phone viewport against a running build and the demo data. Run it after any change to crew screens, `crew_*` functions or crew RLS. It restores everything it changes.
- Every new table ships with RLS tests, and every webhook ships with tests covering a bad signature, a duplicate event, and invalid input.

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

- [x] ~~Set up Vitest (`npm test`).~~ Done; webhook handler tests come with the first webhook.
- [x] ~~Add a CI step running typecheck, lint, test and build.~~ Done; it runs once the branch is pushed to GitHub.
- [x] ~~Fix the 12 existing lint errors.~~ Done: 11 were in MAKI files deleted during the conversion; the last (`not-found.tsx`) was fixed.
- [ ] Show a **"Demo data loaded, purge before launch" banner** in the app shell whenever any row with an id starting `5eed0000-` exists (demo data from `scripts/seed.mts`).
- [ ] **Run the purge before real customers go in**: `node scripts/seed.mts --project-ref lijsaulkeaqlriwqgxty --purge`. It also removes the seeded goals and the two test logins (`seed+ana@example.com`, `seed+luis@example.com`); re-enter the real goals afterwards.
