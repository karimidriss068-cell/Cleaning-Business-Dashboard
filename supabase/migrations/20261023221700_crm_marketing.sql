-- CRM and marketing: contacts, commercial accounts, service properties, the
-- service catalog, leads, the activity timeline, and ad campaign stats.
--
-- Access: office staff (owner/admin/staff) read and write; deletes are
-- admin-only. Marketing writes are admin-only. Subcontractors get nothing
-- here; they see job details only through public.my_jobs() (operations).

create type public.contact_type as enum ('residential', 'commercial');
create type public.account_status as enum ('prospect', 'active', 'paused', 'churned');
create type public.payment_terms as enum ('due_on_receipt', 'net_15', 'net_30', 'net_45');
create type public.lead_stage as enum ('new', 'contacted', 'quoted', 'won', 'lost');
create type public.activity_type as enum ('call', 'sms', 'email', 'note', 'meeting', 'status_change');
create type public.activity_direction as enum ('inbound', 'outbound');
create type public.marketing_platform as enum ('meta', 'google', 'tiktok', 'nextdoor', 'yelp', 'thumbtack', 'other');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'ended');
create type public.pricing_model as enum ('flat', 'hourly', 'per_sqft');

-- Marketing ------------------------------------------------------------------

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  platform public.marketing_platform not null,
  external_id text,
  name text not null check (length(btrim(name)) > 0),
  status public.campaign_status not null default 'active',
  start_date date,
  end_date date,
  budget_cents bigint check (budget_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_platform_external_id_key unique (platform, external_id),
  constraint marketing_campaigns_dates check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.marketing_daily_stats (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns (id) on delete cascade,
  date date not null,
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  leads integer not null default 0 check (leads >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_daily_stats_campaign_date_key unique (campaign_id, date)
);

-- Accounts and contacts --------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  industry text,
  status public.account_status not null default 'prospect',
  walkthrough_at timestamptz,
  monthly_value_cents bigint check (monthly_value_cents >= 0),
  visits_per_month smallint check (visits_per_month between 0 and 62),
  payment_terms public.payment_terms not null default 'net_30',
  renewal_date date,
  -- FK added below, once contacts exists.
  primary_contact_id uuid,
  stripe_customer_id text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  type public.contact_type not null default 'residential',
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text,
  phone text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  email text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address_line1 text,
  address_line2 text,
  city text,
  state text not null default 'NY' check (state ~ '^[A-Z]{2}$'),
  zip text check (zip ~ '^[0-9]{5}$'),
  borough public.borough,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  ghl_contact_id text unique,
  stripe_customer_id text unique,
  account_id uuid references public.accounts (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts
  add constraint accounts_primary_contact_id_fkey
  foreign key (primary_contact_id) references public.contacts (id) on delete set null;

-- A service address. Belongs to exactly one residential contact or one
-- commercial account (a company can have several sites).
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  label text,
  address_line1 text not null check (length(btrim(address_line1)) > 0),
  address_line2 text,
  city text,
  state text not null default 'NY' check (state ~ '^[A-Z]{2}$'),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  borough public.borough not null,
  sqft integer check (sqft > 0),
  bedrooms smallint check (bedrooms >= 0),
  bathrooms numeric(3, 1) check (bathrooms >= 0),
  -- Door codes, key lockbox, doorman notes. Subcontractors see this only on
  -- the day of an assigned job, via public.my_jobs().
  access_instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_one_owner check (num_nonnulls(contact_id, account_id) = 1)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  description text,
  pricing_model public.pricing_model not null default 'flat',
  -- Flat: price per visit. Hourly: price per hour. Per sqft: price per sqft.
  base_price_cents bigint not null check (base_price_cents >= 0),
  default_duration_minutes integer not null check (default_duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete restrict,
  service_id uuid references public.services (id) on delete set null,
  campaign_id uuid references public.marketing_campaigns (id) on delete set null,
  bedrooms smallint check (bedrooms >= 0),
  bathrooms numeric(3, 1) check (bathrooms >= 0),
  sqft integer check (sqft > 0),
  requested_date date,
  stage public.lead_stage not null default 'new',
  first_response_at timestamptz,
  lost_reason text,
  source text,
  ghl_opportunity_id text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_lost_reason check (stage <> 'lost' or lost_reason is not null)
);

-- Timeline entry. Links to at least one of contact, lead, account, job.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  type public.activity_type not null,
  direction public.activity_direction,
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  contact_id uuid references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  -- FK added in the operations migration, once jobs exists.
  job_id uuid,
  -- Provider message id (e.g. GHL), so a re-delivered webhook can't log twice.
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_has_subject check (num_nonnulls(contact_id, lead_id, account_id, job_id) >= 1)
);

-- Indexes (every FK, plus common lookups) ------------------------------------

create index accounts_primary_contact_id_idx on public.accounts (primary_contact_id);
create index accounts_status_idx on public.accounts (status);
create index contacts_account_id_idx on public.contacts (account_id);
create index contacts_phone_idx on public.contacts (phone);
create index contacts_email_idx on public.contacts (email);
create index properties_contact_id_idx on public.properties (contact_id);
create index properties_account_id_idx on public.properties (account_id);
create index leads_contact_id_idx on public.leads (contact_id);
create index leads_service_id_idx on public.leads (service_id);
create index leads_campaign_id_idx on public.leads (campaign_id);
create index leads_stage_created_at_idx on public.leads (stage, created_at desc);
create index activities_actor_user_id_idx on public.activities (actor_user_id);
create index activities_contact_id_idx on public.activities (contact_id, occurred_at desc);
create index activities_lead_id_idx on public.activities (lead_id, occurred_at desc);
create index activities_account_id_idx on public.activities (account_id, occurred_at desc);
create index activities_job_id_idx on public.activities (job_id, occurred_at desc);

-- updated_at triggers ----------------------------------------------------------

create trigger marketing_campaigns_set_updated_at before update on public.marketing_campaigns
  for each row execute function private.set_updated_at();
create trigger marketing_daily_stats_set_updated_at before update on public.marketing_daily_stats
  for each row execute function private.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function private.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();
create trigger properties_set_updated_at before update on public.properties
  for each row execute function private.set_updated_at();
create trigger services_set_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
  for each row execute function private.set_updated_at();
create trigger activities_set_updated_at before update on public.activities
  for each row execute function private.set_updated_at();

-- RLS ----------------------------------------------------------------------------

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_daily_stats enable row level security;
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.properties enable row level security;
alter table public.services enable row level security;
alter table public.leads enable row level security;
alter table public.activities enable row level security;

revoke all on public.marketing_campaigns, public.marketing_daily_stats, public.accounts,
  public.contacts, public.properties, public.services, public.leads, public.activities
  from anon;

-- Staff read/write, admin delete.
create policy "accounts: staff read" on public.accounts for select to authenticated using ((select private.is_staff()));
create policy "accounts: staff insert" on public.accounts for insert to authenticated with check ((select private.is_staff()));
create policy "accounts: staff update" on public.accounts for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "accounts: admin delete" on public.accounts for delete to authenticated using ((select private.is_admin()));

create policy "contacts: staff read" on public.contacts for select to authenticated using ((select private.is_staff()));
create policy "contacts: staff insert" on public.contacts for insert to authenticated with check ((select private.is_staff()));
create policy "contacts: staff update" on public.contacts for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "contacts: admin delete" on public.contacts for delete to authenticated using ((select private.is_admin()));

create policy "properties: staff read" on public.properties for select to authenticated using ((select private.is_staff()));
create policy "properties: staff insert" on public.properties for insert to authenticated with check ((select private.is_staff()));
create policy "properties: staff update" on public.properties for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "properties: admin delete" on public.properties for delete to authenticated using ((select private.is_admin()));

create policy "leads: staff read" on public.leads for select to authenticated using ((select private.is_staff()));
create policy "leads: staff insert" on public.leads for insert to authenticated with check ((select private.is_staff()));
create policy "leads: staff update" on public.leads for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "leads: admin delete" on public.leads for delete to authenticated using ((select private.is_admin()));

create policy "activities: staff read" on public.activities for select to authenticated using ((select private.is_staff()));
create policy "activities: staff insert" on public.activities for insert to authenticated with check ((select private.is_staff()));
create policy "activities: staff update" on public.activities for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "activities: admin delete" on public.activities for delete to authenticated using ((select private.is_admin()));

-- Staff read; admin manages the catalog and marketing data.
create policy "services: staff read" on public.services for select to authenticated using ((select private.is_staff()));
create policy "services: admin insert" on public.services for insert to authenticated with check ((select private.is_admin()));
create policy "services: admin update" on public.services for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "services: admin delete" on public.services for delete to authenticated using ((select private.is_admin()));

create policy "marketing_campaigns: staff read" on public.marketing_campaigns for select to authenticated using ((select private.is_staff()));
create policy "marketing_campaigns: admin insert" on public.marketing_campaigns for insert to authenticated with check ((select private.is_admin()));
create policy "marketing_campaigns: admin update" on public.marketing_campaigns for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "marketing_campaigns: admin delete" on public.marketing_campaigns for delete to authenticated using ((select private.is_admin()));

create policy "marketing_daily_stats: staff read" on public.marketing_daily_stats for select to authenticated using ((select private.is_staff()));
create policy "marketing_daily_stats: admin insert" on public.marketing_daily_stats for insert to authenticated with check ((select private.is_admin()));
create policy "marketing_daily_stats: admin update" on public.marketing_daily_stats for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "marketing_daily_stats: admin delete" on public.marketing_daily_stats for delete to authenticated using ((select private.is_admin()));
