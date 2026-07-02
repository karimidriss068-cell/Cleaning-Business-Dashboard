# MAKI Ops

Internal command center for **MAKI** (marketing agency) to track ad campaigns,
leads, and booked appointments across two contexts:

1. **Internal** — MAKI's own client-acquisition ads.
2. **Client** — ads run for clients on a **$327-per-booked-appointment** model.

It rolls up spend, leads, appointments, cost-per-appointment, and per-account
P&L (revenue owed vs. spend), and ingests GHL leads/appointments via n8n.

---

## Tech stack

| Layer        | Choice                                            |
| ------------ | ------------------------------------------------- |
| Framework    | Next.js (App Router) + TypeScript                 |
| Database     | Supabase (Postgres + Auth)                        |
| Data access  | `@supabase/ssr` (server + browser clients)        |
| UI           | Tailwind CSS + shadcn/ui (dark, gold/amber theme) |
| Automation   | n8n (syncs GHL leads/appointments into Supabase)  |
| Deploy       | Vercel                                            |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` → `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable                        | Where it goes                    | Notes                                                     |
| ------------------------------- | -------------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `.env.local` (this app) + Vercel | Public project API URL.                                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` (this app) + Vercel | Publishable/anon key. Safe in the browser. RLS enforced.  |
| `N8N_WEBHOOK_SECRET`            | `.env.local` (this app) + Vercel | Shared secret for the appointment webhook. Also into n8n. |
| `SUPABASE_SERVICE_ROLE_KEY`     | `.env.local` (this app) + Vercel | **Server-only.** Webhooks, threshold checker, reports.    |
| `ANTHROPIC_API_KEY`             | `.env.local` (this app) + Vercel | **Server-only.** Powers the /insights AI page.            |

> **Where each Supabase key belongs**
>
> - **Anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
>   (and Vercel env). This app only ever uses the anon key; every table is
>   protected by Row Level Security so the authenticated operator has full
>   read/write and nothing is exposed publicly.
> - **`service_role` key** → **never committed to the repo**, never sent to the
>   browser. It bypasses RLS, so it lives only in server-side env:
>   - n8n's Supabase node credentials (lead sync), **and**
>   - `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` / Vercel, used **only** by the
>     appointment-booked webhook route (it has no user session, so it must use
>     the service role to write). It is read server-side and never exposed to the
>     client. Until you set it, the webhook returns `500 "Server not configured"`.

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

### Login

This is a single-operator internal tool. One user was seeded in Supabase Auth
for the MAKI operator. Manage or reset it in the Supabase dashboard under
**Authentication → Users**. To add more operators, create them there (email +
password); no public sign-up is exposed.

---

## Database

The schema lives in [`supabase/migrations/`](supabase/migrations/) and is the
source of truth. Tables: `accounts`, `campaigns`, `creatives`,
`campaign_creatives`, `spend_daily`, `leads`, `appointments`.

- **RLS** is enabled on every table; the authenticated operator has full
  read/write via the anon key.
- Generated TypeScript types live in
  [`src/lib/supabase/database.types.ts`](src/lib/supabase/database.types.ts).
- Appointments auto-fill `revenue_owed` from the account's
  `price_per_appointment` on insert (DB trigger), so the app, manual inserts,
  and n8n stay consistent.

---

## n8n Setup

n8n orchestrates GHL automations (lead qualification, appointment booking,
SMS/email bots) and syncs data into Supabase.

### 1. Supabase node credentials

Configure n8n's **Supabase** node with:

- **Host / Project URL** — the Supabase project API URL
  (`https://<project-ref>.supabase.co`).
- **Service Role Key** — the Supabase `service_role` key
  (Supabase dashboard → **Project Settings → API Keys**). This key bypasses RLS,
  which is intentional for automation writes. **Keep it only in n8n.**

Most syncing — new leads and lead-status updates — is done by writing directly
into the `leads` table with this node (match/update on `ghl_contact_id`).

### 2. Appointment-booked webhook

Appointments need validation logic (compute `revenue_owed`, flip the lead's
status), so they go through this app's API route instead of a raw table write.

- **Endpoint:** `POST https://<your-vercel-domain>/api/webhooks/appointment-booked`
  (locally: `http://localhost:3000/api/webhooks/appointment-booked`)
- **Required header:** `x-webhook-secret: <N8N_WEBHOOK_SECRET>` — the **same**
  value as in `.env.local` / Vercel. Requests without it get `401`.
- **JSON body:**

  ```json
  {
    "lead_id": "uuid-of-the-lead",
    "account_id": "uuid-of-the-account",
    "appointment_date": "2026-07-10T15:00:00Z",
    "ghl_appointment_id": "optional-ghl-id"
  }
  ```

- **What it does:** looks up the account's `price_per_appointment`, creates an
  `appointments` row (`status = 'booked'`, `revenue_owed` pre-filled), flips the
  linked lead to `status = 'booked'`, and returns the created appointment.

In n8n, use an **HTTP Request** node (POST, JSON body) and add the
`x-webhook-secret` header.

> **Prerequisite:** set `SUPABASE_SERVICE_ROLE_KEY` in the app's env
> (`.env.local` locally, Vercel in prod). The route uses it to write the
> appointment and update the lead. Without it the route returns
> `500 "Server not configured"`.

### 3. Campaign matching (to build in the lead-sync workflow)

> **Placeholder / TODO:** GHL leads carry a campaign tag. In the n8n lead-sync
> workflow, add a lookup step that matches the incoming GHL campaign tag to a
> row in `campaigns` via `campaigns.ghl_campaign_tag`, and write the resulting
> `campaign_id` onto the lead. Set `ghl_campaign_tag` on each campaign in the
> app's **New Campaign** form so this lookup has something to match against.

### 4. Outreach sync (V2 — Client Acquisition Engine)

A workflow watches GHL for cold-outreach sequence events (SMS sent, reply
received, call booked from a cold sequence) and writes/updates rows in
**`outreach_contacts`** via the Supabase node (service role key, same pattern as
lead sync — match/update on `ghl_contact_id`). Set the stage timestamps
(`contacted_at`, `replied_at`, `call_booked_at`, `call_held_at`, `closed_at`)
and `status` as the events fire.

> **Script tagging (lookup step):** match the GHL campaign/sequence name to an
> `outreach_scripts.name` and write the resulting `script_id` onto the contact —
> same lookup pattern as `campaigns.ghl_campaign_tag`. Log each hook in the app's
> **New Script** form first so there's something to match against.

### 5. CPA threshold checker (V2 — every 4 hours)

A **Schedule** trigger (every 4h) → **HTTP Request** node:

- `POST https://<your-vercel-domain>/api/webhooks/check-thresholds`
- Header `x-webhook-secret: <N8N_WEBHOOK_SECRET>`
- The response is `{ count, alerts: [...] }`. **Loop** over `alerts` and send
  yourself an SMS **via GHL**: a normal SMS for `type: "cpa_warning"`, and a more
  urgent SMS for `type: "cpa_critical"` (the endpoint has already auto-paused that
  campaign). `type: "zero_leads"` means an active campaign had no leads in 48h.
- Requires `SUPABASE_SERVICE_ROLE_KEY` in the app env (it writes alerts + pauses
  campaigns). Alerts are de-duped per campaign for 24h automatically.

### 6. Weekly digest (V2 — Mondays 8am)

A **Schedule** trigger (Mon 08:00) → **HTTP Request** node:

- `GET https://<your-vercel-domain>/api/reports/weekly-digest`
- Header `x-webhook-secret: <N8N_WEBHOOK_SECRET>`
- Returns JSON: `appointments_booked_this_week`, `best_outreach_script`,
  `cpa_trend` (this vs last week + `change_pct`/`direction`), and
  `paused_or_alerted_campaigns`. Format it into a text message and send it to
  yourself **via GHL** so you start the week knowing where things stand.

### Client reports (V2 — no n8n needed)

Generate a shareable client report from any account page (**Generate Report** →
pick a date range). It mints a read-only public link (`/reports/<token>`, expires
in 30 days) with a **Download PDF** button — send it to clients to prove ROI. The
public route reads only that account's data via the service-role key, guarded by
the unguessable token.

---

## AI Insights (V2)

The **/insights** page lets you ask plain-English questions ("Which client has the
worst CPA trend?") and get answers from your live data, via the Anthropic API
(model `claude-sonnet-4-6`). Set `ANTHROPIC_API_KEY` in `.env.local` / Vercel
(get one at [console.anthropic.com](https://console.anthropic.com/settings/keys));
until then the page shows an "AI not configured" state. The key is server-only and
never reaches the browser.

---

## Deploy (Vercel)

1. Push to GitHub (already wired to `origin`).
2. Import the repo in Vercel.
3. Add all env vars from `.env.example` in the Vercel project settings
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `N8N_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`).
4. After deploy, use the Vercel URL for the n8n webhook + schedule endpoints.
