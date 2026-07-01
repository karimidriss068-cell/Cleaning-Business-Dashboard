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

> **Where each Supabase key belongs**
>
> - **Anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
>   (and Vercel env). This app only ever uses the anon key; every table is
>   protected by Row Level Security so the authenticated operator has full
>   read/write and nothing is exposed publicly.
> - **`service_role` key** → **NOT in this codebase, ever.** It bypasses RLS.
>   It goes **only** into n8n's Supabase node credentials (see *n8n Setup*).

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

### 3. Campaign matching (to build in the lead-sync workflow)

> **Placeholder / TODO:** GHL leads carry a campaign tag. In the n8n lead-sync
> workflow, add a lookup step that matches the incoming GHL campaign tag to a
> row in `campaigns` via `campaigns.ghl_campaign_tag`, and write the resulting
> `campaign_id` onto the lead. Set `ghl_campaign_tag` on each campaign in the
> app's **New Campaign** form so this lookup has something to match against.

---

## Deploy (Vercel)

1. Push to GitHub (already wired to `origin`).
2. Import the repo in Vercel.
3. Add the three env vars above in the Vercel project settings.
4. After deploy, use the Vercel URL for the n8n webhook endpoint.
