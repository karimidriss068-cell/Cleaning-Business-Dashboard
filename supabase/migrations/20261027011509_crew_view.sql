-- Crew view: what an assigned cleaner (subcontractor login) can see and do.
--
-- Cleaners never read office tables directly. They get four functions, built
-- like my_jobs (definer bodies in the private schema behind SECURITY INVOKER
-- wrappers, authenticated only):
--   crew_visits(from, to)     their own visits: address, access notes (on the
--                             day), THEIR OWN pay, teammates' first names,
--                             checklist progress. Never billing, CRM or
--                             anyone else's pay.
--   crew_visit_detail(job)    one visit with its checklist, their note, and
--                             photo count; creates the checklist from the
--                             service template on first open.
--   set_checklist_item(i, b)  tick or untick a task on their own visit.
--   crew_me()                 their name and insurance expiry (for the reminder).
-- Completing a visit stays complete_job (not before 1 hour prior to start).
-- Photos use the private job-photos bucket and job_photos rows (assigned
-- cleaners and staff only); notes are own-row.

create table public.service_checklist_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_checklist_items_service_label_key unique (service_id, label)
);

create table public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  sort_order integer not null default 0,
  done_at timestamptz,
  done_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_checklist_items_job_label_key unique (job_id, label)
);

create table public.job_cleaner_notes (
  job_id uuid not null references public.jobs (id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors (id) on delete cascade,
  note text not null check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, subcontractor_id)
);

create index service_checklist_items_service_id_idx on public.service_checklist_items (service_id, sort_order);
create index job_checklist_items_job_id_idx on public.job_checklist_items (job_id, sort_order);
create index job_checklist_items_done_by_idx on public.job_checklist_items (done_by);
create index job_cleaner_notes_subcontractor_id_idx on public.job_cleaner_notes (subcontractor_id);

create trigger service_checklist_items_set_updated_at before update on public.service_checklist_items for each row execute function private.set_updated_at();
create trigger job_checklist_items_set_updated_at before update on public.job_checklist_items for each row execute function private.set_updated_at();
create trigger job_cleaner_notes_set_updated_at before update on public.job_cleaner_notes for each row execute function private.set_updated_at();

alter table public.service_checklist_items enable row level security;
alter table public.job_checklist_items enable row level security;
alter table public.job_cleaner_notes enable row level security;
revoke all on public.service_checklist_items, public.job_checklist_items, public.job_cleaner_notes from anon;

-- Templates: staff read, admin write. Cleaners don't read templates.
create policy "service_checklist_items: staff read" on public.service_checklist_items for select to authenticated using ((select private.is_staff()));
create policy "service_checklist_items: admin insert" on public.service_checklist_items for insert to authenticated with check ((select private.is_admin()));
create policy "service_checklist_items: admin update" on public.service_checklist_items for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "service_checklist_items: admin delete" on public.service_checklist_items for delete to authenticated using ((select private.is_admin()));

-- Job checklists: staff full access; an assigned cleaner can read their visit's
-- items but ticks them only through set_checklist_item.
create policy "job_checklist_items: staff read or assigned" on public.job_checklist_items for select to authenticated
  using ((select private.is_staff()) or private.is_assigned_to_job(job_id));
create policy "job_checklist_items: staff insert" on public.job_checklist_items for insert to authenticated with check ((select private.is_staff()));
create policy "job_checklist_items: staff update" on public.job_checklist_items for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "job_checklist_items: staff delete" on public.job_checklist_items for delete to authenticated using ((select private.is_staff()));

-- Notes: staff read all; a cleaner reads and writes only their own note on a visit they're on.
create policy "job_cleaner_notes: staff read or own" on public.job_cleaner_notes for select to authenticated
  using ((select private.is_staff()) or (subcontractor_id = (select private.current_subcontractor_id()) and private.is_assigned_to_job(job_id)));
create policy "job_cleaner_notes: own insert" on public.job_cleaner_notes for insert to authenticated
  with check (subcontractor_id = (select private.current_subcontractor_id()) and private.is_assigned_to_job(job_id));
create policy "job_cleaner_notes: own update" on public.job_cleaner_notes for update to authenticated
  using (subcontractor_id = (select private.current_subcontractor_id()) and private.is_assigned_to_job(job_id))
  with check (subcontractor_id = (select private.current_subcontractor_id()) and private.is_assigned_to_job(job_id));
revoke delete on public.job_cleaner_notes from authenticated;

-- Photos: images only, 10 MB each (the bucket enforces both).
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'job-photos';

-- ---------------------------------------------------------------------------

create function private.crew_visits(p_from date default null, p_to date default null)
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
  my_pay_cents bigint,
  pay_pending boolean,
  teammates text[],
  checklist_done bigint,
  checklist_total bigint,
  photo_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    j.id, j.scheduled_start, j.scheduled_end, j.status, s.name,
    coalesce(c.first_name, a.name),
    p.address_line1, p.address_line2, p.borough, p.zip,
    case when (j.scheduled_start at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
         then p.access_instructions end,
    j.crew_notes,
    ja.pay_cents,
    ja.pay_cents is null,
    array(
      select split_part(t.display_name, ' ', 1)
      from public.job_assignments a2
      join public.subcontractors t on t.id = a2.subcontractor_id
      where a2.job_id = j.id and a2.subcontractor_id <> ja.subcontractor_id
      order by t.display_name
    ),
    (select count(*) from public.job_checklist_items i where i.job_id = j.id and i.done_at is not null),
    greatest(
      (select count(*) from public.job_checklist_items i where i.job_id = j.id),
      case when exists (select 1 from public.job_checklist_items i where i.job_id = j.id) then 0
           else (select count(*) from public.service_checklist_items t where t.service_id = j.service_id) end
    ),
    (select count(*) from public.job_photos ph where ph.job_id = j.id)
  from public.jobs j
  join public.job_assignments ja on ja.job_id = j.id and ja.subcontractor_id = private.current_subcontractor_id()
  join public.properties p on p.id = j.property_id
  join public.services s on s.id = j.service_id
  left join public.contacts c on c.id = j.contact_id
  left join public.accounts a on a.id = j.account_id
  where j.status <> 'cancelled'
    and (j.scheduled_start at time zone 'America/New_York')::date
      between coalesce(p_from, (now() at time zone 'America/New_York')::date)
          and coalesce(p_to, (now() at time zone 'America/New_York')::date + 14)
  order by j.scheduled_start
$$;

create function private.crew_visit_detail(p_job_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub uuid := private.current_subcontractor_id();
  v_job public.jobs%rowtype;
begin
  if v_sub is null or not private.is_assigned_to_job(p_job_id) then
    raise exception 'visit not found' using errcode = '42501';
  end if;
  select * into v_job from public.jobs where id = p_job_id and status <> 'cancelled';
  if not found then
    raise exception 'visit not found' using errcode = '42501';
  end if;

  -- First open: copy the service's checklist template onto the visit.
  if v_job.status in ('scheduled', 'in_progress') then
    insert into public.job_checklist_items (job_id, label, sort_order)
    select p_job_id, t.label, t.sort_order from public.service_checklist_items t where t.service_id = v_job.service_id
    on conflict (job_id, label) do nothing;
  end if;

  return (
    select jsonb_build_object(
      'job_id', j.id,
      'scheduled_start', j.scheduled_start,
      'scheduled_end', j.scheduled_end,
      'status', j.status,
      'completed_at', j.completed_at,
      'service_name', s.name,
      'client_name', coalesce(c.first_name, a.name),
      'address_line1', p.address_line1,
      'address_line2', p.address_line2,
      'borough', p.borough,
      'zip', p.zip,
      'access_instructions', case when (j.scheduled_start at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date
                                  then p.access_instructions end,
      'crew_notes', j.crew_notes,
      'my_pay_cents', ja.pay_cents,
      'teammates', to_jsonb(array(
        select split_part(t.display_name, ' ', 1)
        from public.job_assignments a2 join public.subcontractors t on t.id = a2.subcontractor_id
        where a2.job_id = j.id and a2.subcontractor_id <> v_sub order by t.display_name)),
      'checklist', coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'done_at', i.done_at) order by i.sort_order, i.label)
        from public.job_checklist_items i where i.job_id = j.id), '[]'::jsonb),
      'note', coalesce((select n.note from public.job_cleaner_notes n where n.job_id = j.id and n.subcontractor_id = v_sub), '')
    )
    from public.jobs j
    join public.job_assignments ja on ja.job_id = j.id and ja.subcontractor_id = v_sub
    join public.properties p on p.id = j.property_id
    join public.services s on s.id = j.service_id
    left join public.contacts c on c.id = j.contact_id
    left join public.accounts a on a.id = j.account_id
    where j.id = p_job_id
  );
end;
$$;

create function private.set_checklist_item(p_item_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
  v_status public.job_status;
begin
  select i.job_id into v_job from public.job_checklist_items i where i.id = p_item_id;
  if v_job is null or private.current_subcontractor_id() is null or not private.is_assigned_to_job(v_job) then
    raise exception 'task not found' using errcode = '42501';
  end if;
  select status into v_status from public.jobs where id = v_job;
  if v_status not in ('scheduled', 'in_progress') then
    raise exception 'this visit is no longer open' using errcode = 'P0001';
  end if;
  update public.job_checklist_items
  set done_at = case when p_done then now() else null end,
      done_by = case when p_done then (select auth.uid()) else null end
  where id = p_item_id;
end;
$$;

create function private.crew_me()
returns table (display_name text, coi_expires_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select s.display_name, s.coi_expires_on
  from public.subcontractors s
  where s.id = private.current_subcontractor_id()
$$;

revoke execute on function private.crew_visits(date, date), private.crew_visit_detail(uuid), private.set_checklist_item(uuid, boolean), private.crew_me() from public, anon;
grant execute on function private.crew_visits(date, date), private.crew_visit_detail(uuid), private.set_checklist_item(uuid, boolean), private.crew_me() to authenticated;

create function public.crew_visits(p_from date default null, p_to date default null)
returns table (
  job_id uuid, scheduled_start timestamptz, scheduled_end timestamptz, status public.job_status, service_name text, client_name text,
  address_line1 text, address_line2 text, borough public.borough, zip text, access_instructions text, crew_notes text,
  my_pay_cents bigint, pay_pending boolean, teammates text[], checklist_done bigint, checklist_total bigint, photo_count bigint
)
language sql stable security invoker set search_path = ''
as $$ select * from private.crew_visits(p_from, p_to) $$;

create function public.crew_visit_detail(p_job_id uuid)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.crew_visit_detail(p_job_id) $$;

create function public.set_checklist_item(p_item_id uuid, p_done boolean)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.set_checklist_item(p_item_id, p_done) $$;

create function public.crew_me()
returns table (display_name text, coi_expires_on date)
language sql stable security invoker set search_path = ''
as $$ select * from private.crew_me() $$;

revoke execute on function public.crew_visits(date, date), public.crew_visit_detail(uuid), public.set_checklist_item(uuid, boolean), public.crew_me() from public, anon;
grant execute on function public.crew_visits(date, date), public.crew_visit_detail(uuid), public.set_checklist_item(uuid, boolean), public.crew_me() to authenticated;
