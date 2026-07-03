-- MAKI Ops — initial schema
-- Tables: accounts, campaigns, creatives, campaign_creatives, spend_daily, leads, appointments
--
-- Row Level Security model:
--   * RLS is enabled on every table.
--   * The authenticated user (the single MAKI login, via the anon/publishable key)
--     has full read/write access. This is an internal tool with one operator.
--   * n8n automations connect with the Supabase SERVICE ROLE key, which BYPASSES
--     RLS entirely. That is expected and intentional for automation writes
--     (lead sync, appointment booking). The service role key must live ONLY in
--     n8n's Supabase node credentials — never in this codebase or .env.local.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type account_type as enum ('internal', 'client');
create type account_status as enum ('active', 'paused', 'churned');
create type campaign_platform as enum ('meta', 'google', 'other');
create type campaign_status as enum ('draft', 'active', 'paused', 'ended');
create type creative_type as enum ('video', 'image', 'script', 'vsl');
create type creative_status as enum ('testing', 'winning', 'retired');
create type spend_source as enum ('manual', 'meta_api', 'google_api');
create type lead_status as enum ('new', 'contacted', 'qualified', 'booked', 'dead');
create type appointment_status as enum ('booked', 'showed', 'no_show', 'cancelled', 'closed');

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type account_type not null,
  niche text,
  pricing_model text,
  price_per_appointment numeric,
  status account_status not null default 'active',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  name text not null,
  platform campaign_platform not null default 'meta',
  objective text,
  budget_daily numeric,
  status campaign_status not null default 'draft',
  start_date date,
  end_date date,
  ghl_campaign_tag text, -- maps incoming n8n/GHL leads to this campaign
  created_at timestamptz not null default now()
);
create index campaigns_account_id_idx on campaigns (account_id);
create index campaigns_ghl_campaign_tag_idx on campaigns (ghl_campaign_tag);

-- ---------------------------------------------------------------------------
-- creatives
-- ---------------------------------------------------------------------------
create table creatives (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  name text not null,
  type creative_type not null default 'video',
  status creative_status not null default 'testing',
  notes text,
  created_at timestamptz not null default now()
);
create index creatives_account_id_idx on creatives (account_id);

-- ---------------------------------------------------------------------------
-- campaign_creatives (join table)
-- ---------------------------------------------------------------------------
create table campaign_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  creative_id uuid not null references creatives (id) on delete cascade,
  unique (campaign_id, creative_id)
);
create index campaign_creatives_campaign_id_idx on campaign_creatives (campaign_id);
create index campaign_creatives_creative_id_idx on campaign_creatives (creative_id);

-- ---------------------------------------------------------------------------
-- spend_daily
-- ---------------------------------------------------------------------------
create table spend_daily (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  date date not null,
  spend numeric not null default 0,
  impressions integer,
  clicks integer,
  source spend_source not null default 'manual',
  created_at timestamptz not null default now()
);
create index spend_daily_campaign_id_idx on spend_daily (campaign_id);
create index spend_daily_date_idx on spend_daily (date);

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  creative_id uuid references creatives (id) on delete set null,
  name text,
  contact_info text,
  source text,
  ghl_contact_id text, -- used by n8n to sync/update this record
  status lead_status not null default 'new',
  created_at timestamptz not null default now()
);
create index leads_campaign_id_idx on leads (campaign_id);
create index leads_creative_id_idx on leads (creative_id);
create index leads_status_idx on leads (status);
create index leads_ghl_contact_id_idx on leads (ghl_contact_id);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  ghl_appointment_id text,
  status appointment_status not null default 'booked',
  booked_at timestamptz not null default now(),
  appointment_date timestamptz,
  revenue_owed numeric -- auto-filled from account.price_per_appointment on insert
);
create index appointments_lead_id_idx on appointments (lead_id);
create index appointments_account_id_idx on appointments (account_id);

-- When an appointment is created without an explicit revenue_owed, populate it
-- from the account's price_per_appointment. This keeps manual inserts, the app,
-- and any raw n8n writes consistent.
create or replace function set_appointment_revenue_owed()
returns trigger
language plpgsql
as $$
begin
  if new.revenue_owed is null then
    select a.price_per_appointment
      into new.revenue_owed
      from accounts a
     where a.id = new.account_id;
  end if;
  return new;
end;
$$;

create trigger appointments_set_revenue_owed
  before insert on appointments
  for each row
  execute function set_appointment_revenue_owed();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Enable RLS everywhere; grant the authenticated operator full access.
-- (The service role key used by n8n bypasses all of this by design.)
-- ---------------------------------------------------------------------------
alter table accounts enable row level security;
alter table campaigns enable row level security;
alter table creatives enable row level security;
alter table campaign_creatives enable row level security;
alter table spend_daily enable row level security;
alter table leads enable row level security;
alter table appointments enable row level security;

create policy "authenticated full access" on accounts
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on campaigns
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on creatives
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on campaign_creatives
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on spend_daily
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on leads
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on appointments
  for all to authenticated using (true) with check (true);
