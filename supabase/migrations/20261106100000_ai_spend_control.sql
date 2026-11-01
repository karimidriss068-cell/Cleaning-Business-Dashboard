-- AI spend control. Every model call goes through src/lib/ai/call-model.ts, which reserves its
-- worst-case cost here before anything is sent and settles the real cost afterwards.
--
-- The reservation is what makes a cap a cap: ai_reserve takes one lock, adds up what is already
-- spent and held in the New York day and month, and refuses if the new worst case would pass any
-- applicable cap, so concurrent calls can never overshoot. Money is kept in millionths of a dollar
-- (cost_micros) because one call costs a fraction of a cent; cost_cents is that rounded up.
--
-- Scopes: global (every call), feature (e.g. 'board'), bot (one actor), user (one person). For
-- feature, bot and user a row keyed '*' is the default applied to each one separately; a row with
-- a name overrides it. Reads: owner/admin. Cap and kill-switch writes: owner only, through
-- functions that log to finance_log. ai_reserve / ai_settle / ai_fail: service_role only.
-- No prompt or output text is ever stored.

alter table public.finance_log drop constraint finance_log_entity_check;
alter table public.finance_log add constraint finance_log_entity_check
  check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings', 'growth', 'ghl', 'ai'));

create table public.ai_settings (
  id boolean primary key default true check (id),
  kill_switch boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (user_id) on delete set null
);
insert into public.ai_settings (id) values (true);
create index ai_settings_updated_by_idx on public.ai_settings (updated_by);

create table public.ai_budgets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'feature', 'bot', 'user')),
  scope_key text not null check (scope_key ~ '^[A-Za-z0-9*_-]{1,80}$'),
  daily_cap_cents integer check (daily_cap_cents is null or daily_cap_cents between 0 and 10000000),
  monthly_cap_cents integer check (monthly_cap_cents is null or monthly_cap_cents between 0 and 10000000),
  -- false = the cap only raises an alert, nothing is refused
  hard_stop boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (user_id) on delete set null,
  constraint ai_budgets_scope_key unique (scope, scope_key),
  constraint ai_budgets_global_key check (scope <> 'global' or scope_key = '*'),
  constraint ai_budgets_daily_within_monthly check (daily_cap_cents is null or monthly_cap_cents is null or daily_cap_cents <= monthly_cap_cents)
);
create index ai_budgets_updated_by_idx on public.ai_budgets (updated_by);
-- $20/month global, $10/month for the board, $5/month for each bot; daily caps are a tenth of monthly.
insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents) values
  ('global', '*', 200, 2000), ('feature', 'board', 100, 1000), ('bot', '*', 50, 500);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('user', 'bot', 'system')),
  actor_id text not null check (length(actor_id) between 1 and 80),
  feature text not null check (feature ~ '^[a-z0-9_-]{1,60}$'),
  provider text not null check (provider in ('anthropic', 'xai')),
  model text not null check (length(model) between 1 and 80),
  run_id uuid,
  -- reserved: the worst-case hold while a call is in flight; settled: real cost; failed: released; refused: never sent
  status text not null check (status in ('reserved', 'settled', 'failed', 'refused')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  cost_cents integer generated always as (ceil(cost_micros::numeric / 10000)::integer) stored,
  settled_at timestamptz,
  detail text check (detail is null or length(detail) <= 200)
);
create index ai_usage_created_idx on public.ai_usage (created_at desc);
create index ai_usage_feature_idx on public.ai_usage (feature, created_at desc);
create index ai_usage_actor_idx on public.ai_usage (actor_type, actor_id, created_at desc);
create index ai_usage_run_idx on public.ai_usage (run_id) where run_id is not null;

alter table public.ai_settings enable row level security;
alter table public.ai_budgets enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_settings, public.ai_budgets, public.ai_usage from anon;
revoke insert, update, delete on public.ai_settings, public.ai_budgets, public.ai_usage from authenticated;
create policy "ai_settings: admin read" on public.ai_settings for select to authenticated using ((select private.is_admin()));
create policy "ai_budgets: admin read" on public.ai_budgets for select to authenticated using ((select private.is_admin()));
create policy "ai_usage: admin read" on public.ai_usage for select to authenticated using ((select private.is_admin()));

create function private.require_owner()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_role(array['owner']::public.app_role[]) then
    raise exception 'only the owner can do this' using errcode = 'KC004';
  end if;
end;
$$;
revoke execute on function private.require_owner() from public, anon, authenticated;

-- The cap row for one name: its own row, else the '*' default.
create function private.ai_budget_for(p_scope text, p_key text)
returns public.ai_budgets
language sql
stable
set search_path = ''
as $$
  select b from public.ai_budgets b
  where b.scope = p_scope and b.scope_key in (p_key, '*')
  order by (b.scope_key = '*')
  limit 1
$$;
revoke execute on function private.ai_budget_for(text, text) from public, anon, authenticated;

-- Spent plus held since p_from, in micros, for one scope. Open holds older than 10 minutes are ignored.
create function private.ai_spend(p_scope text, p_key text, p_from timestamptz)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(u.cost_micros), 0)::bigint
  from public.ai_usage u
  where u.created_at >= p_from
    and (u.status = 'settled' or (u.status = 'reserved' and u.created_at > now() - interval '10 minutes'))
    and case p_scope
          when 'global' then true
          when 'feature' then u.feature = p_key
          when 'bot' then u.actor_type = 'bot' and u.actor_id = p_key
          else u.actor_type = 'user' and u.actor_id = p_key
        end
$$;
revoke execute on function private.ai_spend(text, text, timestamptz) from public, anon, authenticated;

create function private.ai_day_start() returns timestamptz language sql stable set search_path = '' as $$
  select date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York' $$;
create function private.ai_month_start() returns timestamptz language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York' $$;
revoke execute on function private.ai_day_start(), private.ai_month_start() from public, anon, authenticated;

-- Reserve the worst-case cost of one call, or refuse. Returns {ok, usage_id} or {ok:false, reason, ...}.
create function public.ai_reserve(
  p_actor_type text, p_actor_id text, p_feature text, p_provider text, p_model text,
  p_est_micros bigint, p_run_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_killed boolean;
  v_scope text;
  v_key text;
  v_budget public.ai_budgets;
  v_spent bigint;
  v_window text;
  v_refusal jsonb;
begin
  if p_est_micros is null or p_est_micros < 0 or p_est_micros > 50000000 then
    raise exception 'bad cost estimate' using errcode = 'KC005';
  end if;
  -- One lock for every reservation: the sums below are exact, so a cap cannot be overshot.
  perform pg_advisory_xact_lock(hashtext('ai-budget'));
  update public.ai_usage set status = 'failed', cost_micros = 0, detail = 'reservation expired'
  where status = 'reserved' and created_at < now() - interval '10 minutes';

  select kill_switch into v_killed from public.ai_settings where id;
  if v_killed then
    v_refusal := jsonb_build_object('ok', false, 'reason', 'kill_switch');
  else
    for v_scope, v_key in
      select 'global', '*'
      union all select 'feature', p_feature
      union all select 'bot', p_actor_id where p_actor_type = 'bot'
      union all select 'user', p_actor_id where p_actor_type = 'user'
    loop
      v_budget := private.ai_budget_for(v_scope, v_key);
      continue when v_budget.id is null or not v_budget.hard_stop;
      if v_budget.daily_cap_cents is not null then
        v_spent := private.ai_spend(v_scope, v_key, private.ai_day_start());
        if v_spent + p_est_micros > v_budget.daily_cap_cents::bigint * 10000 then
          v_refusal := jsonb_build_object('ok', false, 'reason', 'budget', 'scope', v_scope, 'key', v_key, 'window', 'daily',
            'cap_cents', v_budget.daily_cap_cents, 'spent_micros', v_spent);
          exit;
        end if;
      end if;
      if v_budget.monthly_cap_cents is not null then
        v_spent := private.ai_spend(v_scope, v_key, private.ai_month_start());
        if v_spent + p_est_micros > v_budget.monthly_cap_cents::bigint * 10000 then
          v_refusal := jsonb_build_object('ok', false, 'reason', 'budget', 'scope', v_scope, 'key', v_key, 'window', 'monthly',
            'cap_cents', v_budget.monthly_cap_cents, 'spent_micros', v_spent);
          exit;
        end if;
      end if;
    end loop;
  end if;

  if v_refusal is not null then
    insert into public.ai_usage (actor_type, actor_id, feature, provider, model, run_id, status, detail)
    values (p_actor_type, p_actor_id, p_feature, p_provider, p_model, p_run_id, 'refused',
            left(concat_ws(':', v_refusal ->> 'reason', v_refusal ->> 'scope', v_refusal ->> 'key', v_refusal ->> 'window'), 200));
    return v_refusal;
  end if;

  insert into public.ai_usage (actor_type, actor_id, feature, provider, model, run_id, status, cost_micros)
  values (p_actor_type, p_actor_id, p_feature, p_provider, p_model, p_run_id, 'reserved', p_est_micros)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'usage_id', v_id);
end;
$$;

-- Replace the hold with what the call really used.
create function public.ai_settle(
  p_usage_id uuid, p_input integer, p_output integer, p_cached integer, p_cache_write integer, p_cost_micros bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_usage
  set status = 'settled', input_tokens = p_input, output_tokens = p_output, cached_input_tokens = p_cached,
      cache_write_tokens = p_cache_write, cost_micros = p_cost_micros, settled_at = now(), detail = null
  where id = p_usage_id and status in ('reserved', 'failed');
  if not found then
    raise exception 'unknown or already settled usage' using errcode = 'KC005';
  end if;
end;
$$;

-- The call failed before it was billed: release the hold.
create function public.ai_fail(p_usage_id uuid, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_usage set status = 'failed', cost_micros = 0, settled_at = now(), detail = left(p_detail, 200)
  where id = p_usage_id and status = 'reserved';
end;
$$;

-- Owner writes ----------------------------------------------------------------

create function private.save_ai_budget(
  p_scope text, p_key text, p_daily integer default null, p_monthly integer default null, p_hard_stop boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  if p_scope not in ('global', 'feature', 'bot', 'user') then
    raise exception 'unknown budget scope' using errcode = 'KC005';
  end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9*_-]{1,80}$' or (p_scope = 'global' and p_key <> '*') then
    raise exception 'that name isn''t valid' using errcode = 'KC005';
  end if;
  if (p_daily is not null and p_daily < 0) or (p_monthly is not null and p_monthly < 0) then
    raise exception 'a cap can''t be negative' using errcode = 'KC005';
  end if;
  if p_daily is not null and p_monthly is not null and p_daily > p_monthly then
    raise exception 'the daily cap can''t be more than the monthly cap' using errcode = 'KC005';
  end if;
  insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents, hard_stop, updated_by)
  values (p_scope, p_key, p_daily, p_monthly, coalesce(p_hard_stop, true), (select auth.uid()))
  on conflict (scope, scope_key) do update
  set daily_cap_cents = excluded.daily_cap_cents, monthly_cap_cents = excluded.monthly_cap_cents,
      hard_stop = excluded.hard_stop, updated_at = now(), updated_by = excluded.updated_by;
  perform private.log_finance('ai', null, 'budget_saved',
    jsonb_build_object('scope', p_scope, 'key', p_key, 'daily_cap_cents', p_daily, 'monthly_cap_cents', p_monthly, 'hard_stop', coalesce(p_hard_stop, true)));
end;
$$;
create function public.save_ai_budget(p_scope text, p_key text, p_daily integer default null, p_monthly integer default null, p_hard_stop boolean default true)
returns void language sql security invoker set search_path = '' as $$ select private.save_ai_budget(p_scope, p_key, p_daily, p_monthly, p_hard_stop) $$;

create function private.delete_ai_budget(p_scope text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  if p_scope = 'global' then
    raise exception 'the global cap can be changed but not removed' using errcode = 'KC005';
  end if;
  delete from public.ai_budgets where scope = p_scope and scope_key = p_key;
  if not found then
    raise exception 'no such budget' using errcode = 'KC005';
  end if;
  perform private.log_finance('ai', null, 'budget_removed', jsonb_build_object('scope', p_scope, 'key', p_key));
end;
$$;
create function public.delete_ai_budget(p_scope text, p_key text)
returns void language sql security invoker set search_path = '' as $$ select private.delete_ai_budget(p_scope, p_key) $$;

create function private.set_ai_kill_switch(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_owner();
  if p_on is null then
    raise exception 'say whether to stop or allow AI calls' using errcode = 'KC005';
  end if;
  update public.ai_settings set kill_switch = p_on, updated_at = now(), updated_by = (select auth.uid()) where id;
  perform private.log_finance('ai', null, case when p_on then 'kill_switch_on' else 'kill_switch_off' end);
end;
$$;
create function public.set_ai_kill_switch(p_on boolean)
returns void language sql security invoker set search_path = '' as $$ select private.set_ai_kill_switch(p_on) $$;

-- Everything the page and the alert banner need, in one reading (owner/admin).
create function private.ai_usage_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day timestamptz := private.ai_day_start();
  v_month timestamptz := private.ai_month_start();
  v_out jsonb;
begin
  perform private.require_admin();
  select jsonb_build_object(
    'kill_switch', (select kill_switch from public.ai_settings where id),
    'day_start', v_day,
    'month_start', v_month,
    'budgets', coalesce((select jsonb_agg(jsonb_build_object(
        'scope', b.scope, 'key', b.scope_key, 'daily_cap_cents', b.daily_cap_cents, 'monthly_cap_cents', b.monthly_cap_cents, 'hard_stop', b.hard_stop,
        'day_micros', case when b.scope_key = '*' and b.scope <> 'global' then null else private.ai_spend(b.scope, b.scope_key, v_day) end,
        'month_micros', case when b.scope_key = '*' and b.scope <> 'global' then null else private.ai_spend(b.scope, b.scope_key, v_month) end)
        order by array_position(array['global', 'feature', 'bot', 'user'], b.scope), b.scope_key)
      from public.ai_budgets b), '[]'),
    'by_feature', coalesce((select jsonb_agg(x order by (x ->> 'month_micros')::bigint desc) from (
        select jsonb_build_object('feature', f.feature,
          'day_micros', private.ai_spend('feature', f.feature, v_day), 'month_micros', private.ai_spend('feature', f.feature, v_month),
          'calls', (select count(*) from public.ai_usage u where u.feature = f.feature and u.status = 'settled' and u.created_at >= v_month),
          'daily_cap_cents', (private.ai_budget_for('feature', f.feature)).daily_cap_cents,
          'monthly_cap_cents', (private.ai_budget_for('feature', f.feature)).monthly_cap_cents,
          'hard_stop', coalesce((private.ai_budget_for('feature', f.feature)).hard_stop, true)) as x
        from (select distinct feature from public.ai_usage where created_at >= v_month) f) s), '[]'),
    'by_actor', coalesce((select jsonb_agg(x order by (x ->> 'month_micros')::bigint desc) from (
        select jsonb_build_object('actor_type', a.actor_type, 'actor_id', a.actor_id,
          'day_micros', private.ai_spend(a.actor_type, a.actor_id, v_day), 'month_micros', private.ai_spend(a.actor_type, a.actor_id, v_month),
          'calls', (select count(*) from public.ai_usage u where u.actor_type = a.actor_type and u.actor_id = a.actor_id and u.status = 'settled' and u.created_at >= v_month),
          'daily_cap_cents', (private.ai_budget_for(a.actor_type, a.actor_id)).daily_cap_cents,
          'monthly_cap_cents', (private.ai_budget_for(a.actor_type, a.actor_id)).monthly_cap_cents,
          'hard_stop', coalesce((private.ai_budget_for(a.actor_type, a.actor_id)).hard_stop, true)) as x
        from (select distinct actor_type, actor_id from public.ai_usage where created_at >= v_month and actor_type in ('bot', 'user')) a) s), '[]'),
    'refused_24h', (select count(*) from public.ai_usage where status = 'refused' and created_at > now() - interval '24 hours'),
    'recent', coalesce((select jsonb_agg(r order by (r ->> 'at') desc) from (
        select jsonb_build_object('at', u.created_at, 'feature', u.feature, 'actor_type', u.actor_type, 'actor_id', u.actor_id, 'model', u.model,
          'status', u.status, 'cost_micros', u.cost_micros, 'detail', u.detail) as r
        from public.ai_usage u order by u.created_at desc limit 15) q), '[]')
  ) into v_out;
  return v_out;
end;
$$;
create function public.ai_usage_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$ select private.ai_usage_summary() $$;

revoke execute on function private.save_ai_budget(text, text, integer, integer, boolean), private.delete_ai_budget(text, text),
  private.set_ai_kill_switch(boolean), private.ai_usage_summary() from public, anon;
grant execute on function private.save_ai_budget(text, text, integer, integer, boolean), private.delete_ai_budget(text, text),
  private.set_ai_kill_switch(boolean), private.ai_usage_summary() to authenticated;
revoke execute on function public.save_ai_budget(text, text, integer, integer, boolean), public.delete_ai_budget(text, text),
  public.set_ai_kill_switch(boolean), public.ai_usage_summary() from public, anon;
grant execute on function public.save_ai_budget(text, text, integer, integer, boolean), public.delete_ai_budget(text, text),
  public.set_ai_kill_switch(boolean), public.ai_usage_summary() to authenticated;

revoke execute on function public.ai_reserve(text, text, text, text, text, bigint, uuid), public.ai_settle(uuid, integer, integer, integer, integer, bigint),
  public.ai_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_reserve(text, text, text, text, text, bigint, uuid), public.ai_settle(uuid, integer, integer, integer, integer, bigint),
  public.ai_fail(uuid, text) to service_role;
