-- Automation and integrations: automations and their runs, a scheduled task
-- queue, SMS/email opt-outs, integration settings (tokens in Supabase Vault),
-- and an outbound/inbound sync queue for GHL and Stripe.
--
-- Workers run server-side with the service role and claim work atomically
-- with claim_scheduled_tasks() / claim_sync_queue() (FOR UPDATE SKIP LOCKED),
-- so two concurrent runs never take the same task. A claimed task whose lock
-- expires (worker crashed) becomes claimable again.
--
-- Every outbound SMS/email must check opt_outs first.
--
-- Access: staff read automations, runs, tasks, sync queue and opt-outs;
-- staff can add opt-outs; everything else is admin-only or service role.

create type public.automation_run_status as enum ('pending', 'running', 'succeeded', 'failed', 'skipped');
create type public.task_status as enum ('pending', 'running', 'succeeded', 'failed', 'cancelled');
create type public.opt_out_channel as enum ('sms', 'email');
create type public.opt_out_source as enum ('stop_keyword', 'manual', 'ghl', 'unsubscribe_link');
create type public.sync_direction as enum ('outbound', 'inbound');
create type public.sync_status as enum ('pending', 'running', 'succeeded', 'failed', 'dead');

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  -- e.g. 'lead.created', 'job.completed', 'invoice.overdue'
  trigger_event text not null check (trigger_event ~ '^[a-z_]+\.[a-z_]+$'),
  conditions jsonb not null default '{}' check (jsonb_typeof(conditions) = 'object'),
  actions jsonb not null default '[]' check (jsonb_typeof(actions) = 'array'),
  is_enabled boolean not null default false,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  -- One run per automation per triggering event, e.g. 'job:<id>:completed'.
  dedupe_key text not null,
  status public.automation_run_status not null default 'pending',
  subject_type text,
  subject_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_runs_automation_dedupe_key unique (automation_id, dedupe_key)
);

create table public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  -- e.g. 'send_sms', 'generate_series_visits', 'invoice_reminder'
  kind text not null check (kind ~ '^[a-z_]+$'),
  payload jsonb not null default '{}',
  run_at timestamptz not null default now(),
  status public.task_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  locked_until timestamptz,
  last_error text,
  completed_at timestamptz,
  dedupe_key text unique,
  automation_run_id uuid references public.automation_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opt_outs (
  id uuid primary key default gen_random_uuid(),
  channel public.opt_out_channel not null,
  -- E.164 phone for sms, lowercase email for email.
  value text not null,
  source public.opt_out_source not null default 'manual',
  reason text,
  opted_out_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opt_outs_channel_value_key unique (channel, value),
  constraint opt_outs_value_format check (
    (channel = 'sms' and value ~ '^\+1[2-9][0-9]{9}$')
    or (channel = 'email' and value = lower(value) and value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  )
);

-- Non-secret config only. Tokens live in Supabase Vault; vault_secret_id
-- points at the secret and is read only through get_integration_secret().
create table public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider ~ '^[a-z0-9_]+$'),
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object'),
  vault_secret_id uuid,
  is_enabled boolean not null default false,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_queue (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9_]+$'),
  direction public.sync_direction not null,
  entity_type text not null check (entity_type ~ '^[a-z_]+$'),
  entity_id uuid,
  operation text not null check (operation ~ '^[a-z_]+$'),
  payload jsonb not null default '{}',
  status public.sync_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one pending sync per entity and operation; re-queuing a change
-- that hasn't synced yet updates nothing new.
create unique index sync_queue_pending_dedupe_idx
  on public.sync_queue (provider, direction, entity_type, entity_id, operation)
  where status = 'pending';

create index automations_created_by_idx on public.automations (created_by);
create index automation_runs_status_idx on public.automation_runs (status);
create index scheduled_tasks_due_idx on public.scheduled_tasks (run_at) where status = 'pending';
create index scheduled_tasks_running_lock_idx on public.scheduled_tasks (locked_until) where status = 'running';
create index scheduled_tasks_automation_run_id_idx on public.scheduled_tasks (automation_run_id);
create index sync_queue_due_idx on public.sync_queue (next_attempt_at) where status = 'pending';
create index sync_queue_running_lock_idx on public.sync_queue (locked_until) where status = 'running';

create trigger automations_set_updated_at before update on public.automations
  for each row execute function private.set_updated_at();
create trigger automation_runs_set_updated_at before update on public.automation_runs
  for each row execute function private.set_updated_at();
create trigger scheduled_tasks_set_updated_at before update on public.scheduled_tasks
  for each row execute function private.set_updated_at();
create trigger opt_outs_set_updated_at before update on public.opt_outs
  for each row execute function private.set_updated_at();
create trigger integration_settings_set_updated_at before update on public.integration_settings
  for each row execute function private.set_updated_at();
create trigger sync_queue_set_updated_at before update on public.sync_queue
  for each row execute function private.set_updated_at();

-- Worker claim functions (service role only) ------------------------------------

create function public.claim_scheduled_tasks(p_limit integer default 20, p_lock_seconds integer default 300)
returns setof public.scheduled_tasks
language sql
set search_path = ''
as $$
  update public.scheduled_tasks t
  set status = 'running',
      attempts = t.attempts + 1,
      locked_until = now() + make_interval(secs => p_lock_seconds)
  where t.id in (
    select c.id from public.scheduled_tasks c
    where (c.status = 'pending' and c.run_at <= now())
       or (c.status = 'running' and c.locked_until < now() and c.attempts < c.max_attempts)
    order by c.run_at
    limit p_limit
    for update skip locked
  )
  returning t.*
$$;

create function public.claim_sync_queue(p_limit integer default 20, p_lock_seconds integer default 300)
returns setof public.sync_queue
language sql
set search_path = ''
as $$
  update public.sync_queue q
  set status = 'running',
      attempts = q.attempts + 1,
      locked_until = now() + make_interval(secs => p_lock_seconds)
  where q.id in (
    select c.id from public.sync_queue c
    where (c.status = 'pending' and c.next_attempt_at <= now())
       or (c.status = 'running' and c.locked_until < now() and c.attempts < c.max_attempts)
    order by c.next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning q.*
$$;

-- Integration secrets (service role only) -----------------------------------------

-- Stores or rotates a provider's token in Vault and links it. Called from a
-- server action after the app has checked the user is an admin.
create function public.set_integration_secret(p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'secret must not be empty' using errcode = '22023';
  end if;

  select s.vault_secret_id into v_secret_id
  from public.integration_settings s where s.provider = p_provider;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, 'integration:' || p_provider);
    insert into public.integration_settings (provider, vault_secret_id, connected_at)
    values (p_provider, v_secret_id, now())
    on conflict (provider) do update
      set vault_secret_id = excluded.vault_secret_id, connected_at = now();
  else
    perform vault.update_secret(v_secret_id, p_secret);
    update public.integration_settings set connected_at = now() where provider = p_provider;
  end if;
end;
$$;

create function public.get_integration_secret(p_provider text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
  from public.integration_settings s
  join vault.decrypted_secrets d on d.id = s.vault_secret_id
  where s.provider = p_provider
$$;

revoke all on function
  public.claim_scheduled_tasks(integer, integer),
  public.claim_sync_queue(integer, integer),
  public.set_integration_secret(text, text),
  public.get_integration_secret(text)
from public, anon, authenticated;
grant execute on function
  public.claim_scheduled_tasks(integer, integer),
  public.claim_sync_queue(integer, integer),
  public.set_integration_secret(text, text),
  public.get_integration_secret(text)
to service_role;

-- RLS ------------------------------------------------------------------------------

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.scheduled_tasks enable row level security;
alter table public.opt_outs enable row level security;
alter table public.integration_settings enable row level security;
alter table public.sync_queue enable row level security;
revoke all on public.automations, public.automation_runs, public.scheduled_tasks,
  public.opt_outs, public.integration_settings, public.sync_queue from anon;

create policy "automations: staff read" on public.automations for select to authenticated using ((select private.is_staff()));
create policy "automations: admin insert" on public.automations for insert to authenticated with check ((select private.is_admin()));
create policy "automations: admin update" on public.automations for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "automations: admin delete" on public.automations for delete to authenticated using ((select private.is_admin()));

-- Runs, tasks and the sync queue are written by workers (service role);
-- the office can see them, and admins can cancel or retry.
create policy "automation_runs: staff read" on public.automation_runs for select to authenticated using ((select private.is_staff()));

create policy "scheduled_tasks: staff read" on public.scheduled_tasks for select to authenticated using ((select private.is_staff()));
create policy "scheduled_tasks: admin update" on public.scheduled_tasks for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "sync_queue: staff read" on public.sync_queue for select to authenticated using ((select private.is_staff()));
create policy "sync_queue: admin update" on public.sync_queue for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "opt_outs: staff read" on public.opt_outs for select to authenticated using ((select private.is_staff()));
create policy "opt_outs: staff insert" on public.opt_outs for insert to authenticated with check ((select private.is_staff()));
create policy "opt_outs: admin delete" on public.opt_outs for delete to authenticated using ((select private.is_admin()));

create policy "integration_settings: admin read" on public.integration_settings for select to authenticated using ((select private.is_admin()));
create policy "integration_settings: admin update" on public.integration_settings for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Admins may toggle and configure an integration, but only
-- set_integration_secret() (service role) can create rows or change which
-- Vault secret a provider points at.
revoke insert, update, delete on public.integration_settings from authenticated;
grant update (config, is_enabled) on public.integration_settings to authenticated;
