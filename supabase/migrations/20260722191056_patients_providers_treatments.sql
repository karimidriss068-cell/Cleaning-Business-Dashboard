-- Phase 1 of the med-spa data model rebuild: persistent patient identity,
-- provider/staff roster, and per-treatment records, distinct from the
-- lead/appointment funnel rows that only track the ad-acquisition side.

-- ---------------------------------------------------------------------------
-- patients
-- ---------------------------------------------------------------------------
create table patients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  ghl_contact_id text, -- source of truth for identity, same pattern as leads.ghl_contact_id
  name text,
  phone text,
  created_at timestamptz not null default now()
);
create index patients_account_id_idx on patients (account_id);
create index patients_ghl_contact_id_idx on patients (ghl_contact_id);
-- One patient per (account, ghl_contact_id) — lets n8n upsert safely going forward.
create unique index patients_account_ghl_contact_id_key
  on patients (account_id, ghl_contact_id)
  where ghl_contact_id is not null;

-- ---------------------------------------------------------------------------
-- providers
-- ---------------------------------------------------------------------------
create table providers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  name text not null,
  role text, -- free text: "injector", "esthetician", "NP", etc. — titles vary by practice
  created_at timestamptz not null default now()
);
create index providers_account_id_idx on providers (account_id);

-- ---------------------------------------------------------------------------
-- treatments
-- ---------------------------------------------------------------------------
create table treatments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  treatment_type text not null, -- "Botox", "filler", "laser", "facial", etc.
  provider_id uuid references providers (id) on delete set null,
  treatment_date timestamptz,
  package_id uuid, -- FK added in Phase 2 once the packages table exists
  created_at timestamptz not null default now()
);
create index treatments_patient_id_idx on treatments (patient_id);
create index treatments_account_id_idx on treatments (account_id);
create index treatments_appointment_id_idx on treatments (appointment_id);
create index treatments_provider_id_idx on treatments (provider_id);
create index treatments_treatment_type_idx on treatments (treatment_type);

-- ---------------------------------------------------------------------------
-- appointments.provider_id — so utilization tracking (Phase 4) works even
-- before every appointment has a full treatments record.
-- ---------------------------------------------------------------------------
alter table appointments add column provider_id uuid references providers (id) on delete set null;
create index appointments_provider_id_idx on appointments (provider_id);

-- ---------------------------------------------------------------------------
-- Backfill patients from existing leads, deduped by (account_id, ghl_contact_id).
-- account_id is resolved from the lead's earliest linked appointment first
-- (appointments carry account_id directly), falling back to the lead's
-- campaign's account_id. contact_info is the closest existing analog to phone.
-- ---------------------------------------------------------------------------
with lead_accounts as (
  select
    l.id as lead_id,
    l.ghl_contact_id,
    l.name,
    l.contact_info,
    l.created_at,
    coalesce(
      (select a.account_id from appointments a where a.lead_id = l.id order by a.booked_at asc limit 1),
      c.account_id
    ) as account_id
  from leads l
  left join campaigns c on c.id = l.campaign_id
),
dedup as (
  select distinct on (account_id, ghl_contact_id)
    account_id, ghl_contact_id, name, contact_info, created_at
  from lead_accounts
  where account_id is not null and ghl_contact_id is not null
  order by account_id, ghl_contact_id, created_at asc
)
insert into patients (account_id, ghl_contact_id, name, phone, created_at)
select account_id, ghl_contact_id, name, contact_info, created_at
from dedup;

-- Leads with no ghl_contact_id have no dedup key — insert one patient row each.
insert into patients (account_id, ghl_contact_id, name, phone, created_at)
select
  coalesce(
    (select a.account_id from appointments a where a.lead_id = l.id order by a.booked_at asc limit 1),
    c.account_id
  ),
  null,
  l.name,
  l.contact_info,
  l.created_at
from leads l
left join campaigns c on c.id = l.campaign_id
where l.ghl_contact_id is null
  and coalesce(
    (select a.account_id from appointments a where a.lead_id = l.id order by a.booked_at asc limit 1),
    c.account_id
  ) is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security — same "authenticated operator has full access" model
-- as every other table in this app.
-- ---------------------------------------------------------------------------
alter table patients enable row level security;
alter table providers enable row level security;
alter table treatments enable row level security;

create policy "authenticated full access" on patients
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on providers
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on treatments
  for all to authenticated using (true) with check (true);
