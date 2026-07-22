-- Phase 2: patient packages/memberships (session bundles with an
-- expiration date), the source of truth for the expiration tracker.
create table packages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  account_id uuid not null references accounts (id) on delete cascade,
  package_name text not null,
  sessions_total integer not null,
  sessions_used integer not null default 0,
  purchase_date date not null default current_date,
  expiration_date date,
  price numeric,
  created_at timestamptz not null default now()
);
create index packages_patient_id_idx on packages (patient_id);
create index packages_account_id_idx on packages (account_id);
create index packages_expiration_date_idx on packages (expiration_date);

-- Wire up the package_id column left nullable/unconstrained in Phase 1, now
-- that the packages table it points to actually exists.
alter table treatments
  add constraint treatments_package_id_fkey
  foreign key (package_id) references packages (id) on delete set null;

-- New digest finding type for the expiration tracker (Phase 2).
alter type insights_digest_finding_type add value 'package_expiring';

alter table packages enable row level security;
create policy "authenticated full access" on packages
  for all to authenticated using (true) with check (true);
