-- MAKI Ops V2 — Part 1: Client Acquisition Engine (outreach)
-- Tracks cold outreach scripts and the contacts run through them, so the
-- script leaderboard can show where each hook leaks in the funnel.

create type outreach_channel as enum ('sms', 'cold_call', 'dm', 'email');
create type outreach_script_status as enum ('testing', 'winning', 'retired');
create type outreach_contact_status as enum (
  'contacted', 'replied', 'call_booked', 'call_held', 'closed', 'dead'
);

create table outreach_scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel outreach_channel not null default 'sms',
  content text,
  status outreach_script_status not null default 'testing',
  created_at timestamptz not null default now()
);

create table outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  contact_info text,
  niche text,
  channel outreach_channel not null default 'sms',
  script_id uuid references outreach_scripts (id) on delete set null,
  status outreach_contact_status not null default 'contacted',
  ghl_contact_id text,
  source_batch text,
  contacted_at timestamptz,
  replied_at timestamptz,
  call_booked_at timestamptz,
  call_held_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index outreach_contacts_script_id_idx on outreach_contacts (script_id);
create index outreach_contacts_status_idx on outreach_contacts (status);
create index outreach_contacts_channel_idx on outreach_contacts (channel);
create index outreach_contacts_ghl_contact_id_idx on outreach_contacts (ghl_contact_id);

alter table outreach_scripts enable row level security;
alter table outreach_contacts enable row level security;

create policy "authenticated full access" on outreach_scripts
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on outreach_contacts
  for all to authenticated using (true) with check (true);
