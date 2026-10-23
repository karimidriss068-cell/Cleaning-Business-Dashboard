-- Workforce: 1099 subcontractors, crews, and their compliance documents.
--
-- No TINs, SSNs or bank details are stored (CLAUDE.md rule 2). The payout
-- vendor holds those; we keep only payout_vendor_ref. W-9s and COIs live in a
-- private storage bucket that only admins can write.
--
-- Access: staff read, admin write. Subcontractors have no direct access; a
-- subcontractor's login links to their row via profiles.subcontractor_id.

create type public.subcontractor_status as enum ('onboarding', 'active', 'inactive');
create type public.business_entity as enum ('individual', 'llc', 'corporation');
create type public.pay_type as enum ('flat', 'percent', 'hourly');
create type public.subcontractor_document_type as enum ('w9', 'coi', 'agreement', 'other');

create table public.subcontractors (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  legal_name text,
  business_entity public.business_entity not null default 'individual',
  email text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  status public.subcontractor_status not null default 'onboarding',
  boroughs_served public.borough[] not null default '{}',
  -- Default pay terms, snapshotted onto each job assignment.
  -- percent: pay_rate_bps of the job price (2500 = 25%).
  -- flat: pay_rate_cents per job. hourly: pay_rate_cents per hour.
  pay_type public.pay_type not null default 'percent',
  pay_rate_bps integer check (pay_rate_bps between 0 and 10000),
  pay_rate_cents bigint check (pay_rate_cents >= 0),
  payout_vendor_ref text,
  w9_received_at timestamptz,
  coi_expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractors_pay_rate check (
    (pay_type = 'percent' and pay_rate_bps is not null)
    or (pay_type in ('flat', 'hourly') and pay_rate_cents is not null)
  )
);

alter table public.profiles
  add constraint profiles_subcontractor_id_fkey
  foreign key (subcontractor_id) references public.subcontractors (id) on delete restrict;

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  lead_subcontractor_id uuid references public.subcontractors (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crew_members (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crew_members_crew_subcontractor_key unique (crew_id, subcontractor_id)
);

create table public.subcontractor_documents (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors (id) on delete cascade,
  type public.subcontractor_document_type not null,
  -- Object path inside the subcontractor-documents bucket: {subcontractor_id}/{file}.
  storage_path text not null unique,
  expires_on date,
  uploaded_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subcontractors_status_idx on public.subcontractors (status);
create index crews_lead_subcontractor_id_idx on public.crews (lead_subcontractor_id);
create index crew_members_subcontractor_id_idx on public.crew_members (subcontractor_id);
create index subcontractor_documents_subcontractor_id_idx on public.subcontractor_documents (subcontractor_id);
create index subcontractor_documents_uploaded_by_idx on public.subcontractor_documents (uploaded_by);
create index subcontractor_documents_expires_on_idx on public.subcontractor_documents (expires_on);

create trigger subcontractors_set_updated_at before update on public.subcontractors
  for each row execute function private.set_updated_at();
create trigger crews_set_updated_at before update on public.crews
  for each row execute function private.set_updated_at();
create trigger crew_members_set_updated_at before update on public.crew_members
  for each row execute function private.set_updated_at();
create trigger subcontractor_documents_set_updated_at before update on public.subcontractor_documents
  for each row execute function private.set_updated_at();

alter table public.subcontractors enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.subcontractor_documents enable row level security;
revoke all on public.subcontractors, public.crews, public.crew_members, public.subcontractor_documents from anon;

create policy "subcontractors: staff read" on public.subcontractors for select to authenticated using ((select private.is_staff()));
create policy "subcontractors: admin insert" on public.subcontractors for insert to authenticated with check ((select private.is_admin()));
create policy "subcontractors: admin update" on public.subcontractors for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "subcontractors: admin delete" on public.subcontractors for delete to authenticated using ((select private.is_admin()));

create policy "crews: staff read" on public.crews for select to authenticated using ((select private.is_staff()));
create policy "crews: admin insert" on public.crews for insert to authenticated with check ((select private.is_admin()));
create policy "crews: admin update" on public.crews for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "crews: admin delete" on public.crews for delete to authenticated using ((select private.is_admin()));

create policy "crew_members: staff read" on public.crew_members for select to authenticated using ((select private.is_staff()));
create policy "crew_members: admin insert" on public.crew_members for insert to authenticated with check ((select private.is_admin()));
create policy "crew_members: admin update" on public.crew_members for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "crew_members: admin delete" on public.crew_members for delete to authenticated using ((select private.is_admin()));

create policy "subcontractor_documents: staff read" on public.subcontractor_documents for select to authenticated using ((select private.is_staff()));
create policy "subcontractor_documents: admin insert" on public.subcontractor_documents for insert to authenticated with check ((select private.is_admin()));
create policy "subcontractor_documents: admin update" on public.subcontractor_documents for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "subcontractor_documents: admin delete" on public.subcontractor_documents for delete to authenticated using ((select private.is_admin()));

-- Private bucket for W-9s, COIs and agreements.
insert into storage.buckets (id, name, public)
values ('subcontractor-documents', 'subcontractor-documents', false)
on conflict (id) do nothing;

create policy "subcontractor-documents: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'subcontractor-documents' and (select private.is_staff()));
create policy "subcontractor-documents: admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'subcontractor-documents' and (select private.is_admin()));
create policy "subcontractor-documents: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'subcontractor-documents' and (select private.is_admin()))
  with check (bucket_id = 'subcontractor-documents' and (select private.is_admin()));
create policy "subcontractor-documents: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'subcontractor-documents' and (select private.is_admin()));
