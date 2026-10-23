-- Operations: recurring series, jobs (one row per visit), subcontractor
-- assignments with pay, and job photos.
--
-- Recurring work: job_series holds an RRULE interpreted in America/New_York
-- plus a local start time. The app expands it about 8 weeks ahead into jobs
-- rows, converting each local date+time to UTC (DST-safe), and records
-- generated_through. unique (series_id, scheduled_start) makes the expansion
-- idempotent, so re-running it never duplicates visits.
--
-- Subcontractor access: no direct table reads. public.my_jobs() returns only
-- their assigned jobs with limited columns (address, client first name, and
-- access instructions on the job's NY date only). public.complete_job()
-- marks an assigned job complete. They can view and upload photos for
-- their assigned jobs only, and can't delete them.

create type public.job_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_access');
create type public.job_photo_kind as enum ('before', 'after', 'issue');

create table public.job_series (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  default_crew_id uuid references public.crews (id) on delete set null,
  recurrence_rule text not null check (recurrence_rule ~ '^(RRULE:)?FREQ=(DAILY|WEEKLY|MONTHLY)(;[A-Z]+=[A-Z0-9,+-]+)*$'),
  start_date date not null,
  end_date date,
  local_start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents bigint not null check (price_cents >= 0),
  is_active boolean not null default true,
  generated_through date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_series_has_customer check (num_nonnulls(contact_id, account_id) >= 1),
  constraint job_series_dates check (end_date is null or end_date >= start_date)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.job_series (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  crew_id uuid references public.crews (id) on delete set null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  status public.job_status not null default 'scheduled',
  price_cents bigint not null check (price_cents >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles (user_id) on delete set null,
  cancellation_reason text,
  -- Internal office notes vs. notes shown to the crew through my_jobs().
  notes text,
  crew_notes text,
  external_id text unique,
  ghl_appointment_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_has_customer check (num_nonnulls(contact_id, account_id) >= 1),
  constraint jobs_time_order check (scheduled_end > scheduled_start),
  constraint jobs_completed_at check (status <> 'completed' or completed_at is not null),
  constraint jobs_series_visit_key unique (series_id, scheduled_start)
);

alter table public.activities
  add constraint activities_job_id_fkey
  foreign key (job_id) references public.jobs (id) on delete cascade;

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors (id) on delete restrict,
  -- Snapshot of the subcontractor's pay terms when assigned. Filled from
  -- subcontractors by trigger if not given.
  pay_type public.pay_type not null,
  pay_rate_bps integer check (pay_rate_bps between 0 and 10000),
  pay_rate_cents bigint check (pay_rate_cents >= 0),
  -- Hourly pay without a time clock: staff enter the minutes worked.
  minutes_worked integer check (minutes_worked >= 0),
  computed_pay_cents bigint check (computed_pay_cents >= 0),
  pay_override_cents bigint check (pay_override_cents >= 0),
  pay_cents bigint generated always as (coalesce(pay_override_cents, computed_pay_cents)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_assignments_job_subcontractor_key unique (job_id, subcontractor_id),
  constraint job_assignments_pay_rate check (
    (pay_type = 'percent' and pay_rate_bps is not null)
    or (pay_type in ('flat', 'hourly') and pay_rate_cents is not null)
  )
);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  -- Object path inside the job-photos bucket: {job_id}/{file}.
  storage_path text not null unique,
  kind public.job_photo_kind not null default 'after',
  uploaded_by uuid references public.profiles (user_id) on delete set null,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_photos_path_matches_job check (storage_path like job_id::text || '/%')
);

create index job_series_contact_id_idx on public.job_series (contact_id);
create index job_series_account_id_idx on public.job_series (account_id);
create index job_series_property_id_idx on public.job_series (property_id);
create index job_series_service_id_idx on public.job_series (service_id);
create index job_series_default_crew_id_idx on public.job_series (default_crew_id);
create index job_series_active_generated_idx on public.job_series (generated_through) where is_active;
create index jobs_quote_id_idx on public.jobs (quote_id);
create index jobs_contact_id_idx on public.jobs (contact_id);
create index jobs_account_id_idx on public.jobs (account_id);
create index jobs_property_id_idx on public.jobs (property_id);
create index jobs_service_id_idx on public.jobs (service_id);
create index jobs_crew_id_idx on public.jobs (crew_id);
create index jobs_completed_by_idx on public.jobs (completed_by);
create index jobs_scheduled_start_idx on public.jobs (scheduled_start);
create index jobs_status_scheduled_start_idx on public.jobs (status, scheduled_start);
create index job_assignments_subcontractor_id_idx on public.job_assignments (subcontractor_id);
create index job_photos_job_id_idx on public.job_photos (job_id);
create index job_photos_uploaded_by_idx on public.job_photos (uploaded_by);

create trigger job_series_set_updated_at before update on public.job_series
  for each row execute function private.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function private.set_updated_at();
create trigger job_assignments_set_updated_at before update on public.job_assignments
  for each row execute function private.set_updated_at();
create trigger job_photos_set_updated_at before update on public.job_photos
  for each row execute function private.set_updated_at();

-- Pay calculation ----------------------------------------------------------------

-- Snapshots pay terms on insert and recomputes computed_pay_cents. Integer
-- math, rounded half up. Hourly pay stays null until minutes_worked is set.
create function private.compute_assignment_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  job_price bigint;
begin
  if tg_op = 'INSERT' and new.pay_type is null then
    select s.pay_type, s.pay_rate_bps, s.pay_rate_cents
    into new.pay_type, new.pay_rate_bps, new.pay_rate_cents
    from public.subcontractors s
    where s.id = new.subcontractor_id;
  end if;

  select j.price_cents into job_price from public.jobs j where j.id = new.job_id;

  new.computed_pay_cents := case new.pay_type
    when 'percent' then (job_price * new.pay_rate_bps + 5000) / 10000
    when 'flat' then new.pay_rate_cents
    when 'hourly' then
      case when new.minutes_worked is null then null
           else (new.pay_rate_cents * new.minutes_worked + 30) / 60 end
  end;
  return new;
end;
$$;

create trigger job_assignments_compute_pay
  before insert or update on public.job_assignments
  for each row execute function private.compute_assignment_pay();

-- A job price change re-runs the pay calculation on its assignments.
create function private.recompute_job_assignment_pay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.job_assignments set updated_at = now() where job_id = new.id;
  return null;
end;
$$;

create trigger jobs_recompute_assignment_pay
  after update of price_cents on public.jobs
  for each row
  when (old.price_cents is distinct from new.price_cents)
  execute function private.recompute_job_assignment_pay();

-- Subcontractor helpers --------------------------------------------------------

create function private.is_assigned_to_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.job_assignments a
    where a.job_id = p_job_id
      and a.subcontractor_id = private.current_subcontractor_id()
  )
$$;

-- Storage object names are user-supplied; check the folder is a UUID before
-- casting so a malformed path is denied instead of erroring.
create function private.can_access_job_photo_path(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  folder text := (storage.foldername(p_name))[1];
begin
  if folder is null or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_staff() or private.is_assigned_to_job(folder::uuid);
end;
$$;

-- Trigger-only functions: no grants. Policy helpers: authenticated only.
revoke execute on function private.compute_assignment_pay(), private.recompute_job_assignment_pay(),
  private.is_assigned_to_job(uuid), private.can_access_job_photo_path(text) from public, anon;
grant execute on function private.is_assigned_to_job(uuid), private.can_access_job_photo_path(text)
  to authenticated;

-- The subcontractor's job list. security definer because subcontractors have
-- no SELECT on jobs, properties or contacts; this returns only the columns a
-- crew needs. Returns nothing for anyone who isn't a linked subcontractor.
create function public.my_jobs(p_from date default null, p_to date default null)
returns table (
  job_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status public.job_status,
  service_name text,
  client_name text,
  address_line1 text,
  address_line2 text,
  borough public.borough,
  zip text,
  access_instructions text,
  crew_notes text,
  photo_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id,
    j.scheduled_start,
    j.scheduled_end,
    j.status,
    s.name,
    coalesce(c.first_name, a.name),
    p.address_line1,
    p.address_line2,
    p.borough,
    p.zip,
    case
      when (j.scheduled_start at time zone 'America/New_York')::date
         = (now() at time zone 'America/New_York')::date
      then p.access_instructions
    end,
    j.crew_notes,
    (select count(*) from public.job_photos ph where ph.job_id = j.id)
  from public.jobs j
  join public.job_assignments ja
    on ja.job_id = j.id and ja.subcontractor_id = private.current_subcontractor_id()
  join public.properties p on p.id = j.property_id
  join public.services s on s.id = j.service_id
  left join public.contacts c on c.id = j.contact_id
  left join public.accounts a on a.id = j.account_id
  where j.status <> 'cancelled'
    and (j.scheduled_start at time zone 'America/New_York')::date
      between coalesce(p_from, (now() at time zone 'America/New_York')::date - 7)
          and coalesce(p_to, (now() at time zone 'America/New_York')::date + 30)
  order by j.scheduled_start
$$;

-- Lets an assigned subcontractor mark a job complete. Idempotent: completing
-- an already-completed job is a no-op. A job can't be completed earlier than
-- one hour before its scheduled start.
create function public.complete_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid := private.current_subcontractor_id();
  v_status public.job_status;
  v_start timestamptz;
begin
  if v_sub is null or not private.is_assigned_to_job(p_job_id) then
    raise exception 'job not assigned to you' using errcode = '42501';
  end if;

  select j.status, j.scheduled_start into v_status, v_start
  from public.jobs j where j.id = p_job_id for update;
  if v_status = 'completed' then
    return;
  end if;
  if v_status not in ('scheduled', 'in_progress') then
    raise exception 'job cannot be completed from status %', v_status using errcode = 'P0001';
  end if;
  if now() < v_start - interval '1 hour' then
    raise exception 'job can''t be completed more than 1 hour before its scheduled start' using errcode = 'P0001';
  end if;

  update public.jobs
  set status = 'completed', completed_at = now(), completed_by = (select auth.uid())
  where id = p_job_id;
end;
$$;

revoke execute on function public.my_jobs(date, date), public.complete_job(uuid) from public, anon;
grant execute on function public.my_jobs(date, date), public.complete_job(uuid) to authenticated;

-- RLS ----------------------------------------------------------------------------

alter table public.job_series enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_photos enable row level security;
revoke all on public.job_series, public.jobs, public.job_assignments, public.job_photos from anon;

create policy "job_series: staff read" on public.job_series for select to authenticated using ((select private.is_staff()));
create policy "job_series: staff insert" on public.job_series for insert to authenticated with check ((select private.is_staff()));
create policy "job_series: staff update" on public.job_series for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "job_series: admin delete" on public.job_series for delete to authenticated using ((select private.is_admin()));

create policy "jobs: staff read" on public.jobs for select to authenticated using ((select private.is_staff()));
create policy "jobs: staff insert" on public.jobs for insert to authenticated with check ((select private.is_staff()));
create policy "jobs: staff update" on public.jobs for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "jobs: admin delete" on public.jobs for delete to authenticated using ((select private.is_admin()));

create policy "job_assignments: staff read" on public.job_assignments for select to authenticated using ((select private.is_staff()));
create policy "job_assignments: staff insert" on public.job_assignments for insert to authenticated with check ((select private.is_staff()));
create policy "job_assignments: staff update" on public.job_assignments for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "job_assignments: staff delete" on public.job_assignments for delete to authenticated using ((select private.is_staff()));

create policy "job_photos: staff or assigned read" on public.job_photos for select to authenticated
  using ((select private.is_staff()) or private.is_assigned_to_job(job_id));
create policy "job_photos: staff or assigned insert" on public.job_photos for insert to authenticated
  with check (
    (select private.is_staff())
    or (private.is_assigned_to_job(job_id) and uploaded_by = (select auth.uid()))
  );
create policy "job_photos: staff update" on public.job_photos for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "job_photos: staff delete" on public.job_photos for delete to authenticated
  using ((select private.is_staff()));

-- Private bucket for job photos, foldered by job id.
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

create policy "job-photos: staff or assigned read"
  on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and private.can_access_job_photo_path(name));
create policy "job-photos: staff or assigned insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and private.can_access_job_photo_path(name));
create policy "job-photos: staff update"
  on storage.objects for update to authenticated
  using (bucket_id = 'job-photos' and (select private.is_staff()))
  with check (bucket_id = 'job-photos' and (select private.is_staff()));
create policy "job-photos: staff delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and (select private.is_staff()));
