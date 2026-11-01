-- AI spend control: reservations and caps (daily, monthly, per feature, per bot, per user), the kill
-- switch, soft caps, expiry, settle and fail, cents rounding, owner-only writes, and who may read.
-- Always rolls back; read the RESULTS line. Any ALLOWED(BAD) is a failure.
do $$
declare
  owner uuid := gen_random_uuid(); admin uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid();
  s1 uuid; res jsonb; res2 jsonb; id1 uuid; id2 uuid; r text := ''; n int; sm jsonb;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (admin, 'a@test.invalid', 'authenticated', 'authenticated'),
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (u1, 'u1@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana Ruiz', 4000, 'active') returning id into s1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (admin, 'admin', 'A', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1);
  -- A clean slate for the test: no other usage, known caps.
  delete from public.ai_usage where id is not null;
  update public.ai_budgets set daily_cap_cents = 200, monthly_cap_cents = 2000, hard_stop = true where scope = 'global';
  insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents) values ('feature', 'test_f', 5, 50), ('feature', 'test_soft', 1, 1);
  update public.ai_budgets set hard_stop = false where scope_key = 'test_soft';

  r := r || 'seeded-defaults=' || (select string_agg(scope || ':' || scope_key || ':' || coalesce(daily_cap_cents::text, '-') || '/' || coalesce(monthly_cap_cents::text, '-') || ':' || hard_stop::text, ',' order by scope, scope_key)
                                   from public.ai_budgets where scope_key in ('*', 'board')) || ' ';

  execute 'set local role service_role';
  -- reserve, settle
  res := public.ai_reserve('bot', 'roast', 'test_f', 'anthropic', 'claude-haiku-5-5', 30000);
  id1 := (res ->> 'usage_id')::uuid;
  r := r || 'first-reserve=' || (res ->> 'ok') || ' ';
  res2 := public.ai_reserve('bot', 'roast', 'test_f', 'anthropic', 'claude-haiku-5-5', 30000);
  r := r || 'feature-daily-cap-refuses=' || (res2 ->> 'ok') || '/' || coalesce(res2 ->> 'reason', '') || '/' || coalesce(res2 ->> 'scope', '') || '/' || coalesce(res2 ->> 'window', '') || ' ';
  r := r || 'refusal-logged=' || (select count(*) from public.ai_usage where status = 'refused' and detail like 'budget:feature:test_f:daily') || ' ';
  perform public.ai_settle(id1, 100, 20, 0, 0, 10000);
  r := r || 'settle-replaces-hold=' || (select cost_micros || '/' || cost_cents || '/' || status || '/' || input_tokens from public.ai_usage where id = id1) || ' ';
  res2 := public.ai_reserve('bot', 'roast', 'test_f', 'anthropic', 'claude-haiku-5-5', 30000);
  r := r || 'after-settle-fits=' || (res2 ->> 'ok') || ' ';
  id2 := (res2 ->> 'usage_id')::uuid;
  perform public.ai_fail(id2, 'boom');
  r := r || 'fail-releases=' || (select cost_micros || '/' || status from public.ai_usage where id = id2) || ' ';
  res2 := public.ai_reserve('bot', 'roast', 'test_f', 'anthropic', 'claude-haiku-5-5', 30000);
  r := r || 'fits-again-after-fail=' || (res2 ->> 'ok') || ' ';

  -- cents are rounded up
  r := r || 'cents-roundup=' || (select string_agg(c::text, ',' order by m) from (
      select m, (ceil(m::numeric / 10000))::int as c from unnest(array[0, 1, 9999, 10000, 10001]::bigint[]) m) x) || ' ';

  -- per-bot default is separate for each bot
  res := public.ai_reserve('bot', 'agents', 'other', 'xai', 'grok-4', 400000);
  r := r || 'bot-a-under-daily=' || (res ->> 'ok') || ' ';
  res2 := public.ai_reserve('bot', 'agents', 'other', 'xai', 'grok-4', 200000);
  r := r || 'bot-a-over-daily=' || (res2 ->> 'ok') || '/' || coalesce(res2 ->> 'scope', '') || '/' || coalesce(res2 ->> 'key', '') || ' ';
  res2 := public.ai_reserve('bot', 'voice', 'other', 'xai', 'grok-4', 400000);
  r := r || 'bot-b-has-its-own-cap=' || (res2 ->> 'ok') || ' ';
  res2 := public.ai_reserve('system', 'cron', 'other', 'xai', 'grok-4', 400000);
  r := r || 'system-has-no-bot-cap=' || (res2 ->> 'ok') || ' ';

  -- a named bot cap overrides the default
  execute 'reset role';
  insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents) values ('bot', 'agents', 200, 500);
  execute 'set local role service_role';
  res := public.ai_reserve('bot', 'agents', 'other', 'xai', 'grok-4', 200000);
  r := r || 'named-bot-cap-overrides=' || (res ->> 'ok') || ' ';

  -- global cap: spent so far counts for everyone
  execute 'reset role';
  update public.ai_budgets set daily_cap_cents = 20, monthly_cap_cents = 2000 where scope = 'global';
  execute 'set local role service_role';
  res := public.ai_reserve('system', 'cron', 'whatever', 'anthropic', 'claude-haiku-5-5', 10000);
  r := r || 'global-daily-cap=' || (res ->> 'ok') || '/' || coalesce(res ->> 'scope', '') || '/' || coalesce(res ->> 'window', '') || ' ';
  execute 'reset role';
  update public.ai_budgets set daily_cap_cents = 100000, monthly_cap_cents = 100000 where scope = 'global';
  execute 'set local role service_role';

  -- monthly cap
  execute 'reset role';
  insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents) values ('feature', 'test_m', null, 3);
  execute 'set local role service_role';
  res := public.ai_reserve('system', 'cron', 'test_m', 'anthropic', 'claude-haiku-5-5', 20000);
  res2 := public.ai_reserve('system', 'cron', 'test_m', 'anthropic', 'claude-haiku-5-5', 20000);
  r := r || 'monthly-cap=' || (res ->> 'ok') || '/' || (res2 ->> 'ok') || '/' || coalesce(res2 ->> 'window', '') || ' ';

  -- per-user cap via the default row
  execute 'reset role';
  insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents) values ('user', '*', 1, 10);
  execute 'set local role service_role';
  res := public.ai_reserve('user', owner::text, 'u_feat', 'anthropic', 'claude-haiku-5-5', 8000);
  res2 := public.ai_reserve('user', owner::text, 'u_feat', 'anthropic', 'claude-haiku-5-5', 8000);
  r := r || 'user-cap=' || (res ->> 'ok') || '/' || (res2 ->> 'ok') || '/' || coalesce(res2 ->> 'scope', '') || ' ';

  -- a soft cap never refuses
  res := public.ai_reserve('system', 'cron', 'test_soft', 'anthropic', 'claude-haiku-5-5', 900000);
  r := r || 'soft-cap-allows=' || (res ->> 'ok') || ' ';

  -- expired holds stop counting
  execute 'reset role';
  insert into public.ai_usage (actor_type, actor_id, feature, provider, model, status, cost_micros, created_at)
  values ('system', 'cron', 'test_old', 'anthropic', 'm', 'reserved', 99000000, now() - interval '11 minutes');
  insert into public.ai_budgets (scope, scope_key, daily_cap_cents, monthly_cap_cents) values ('feature', 'test_old', 10, 10);
  execute 'set local role service_role';
  res := public.ai_reserve('system', 'cron', 'test_old', 'anthropic', 'claude-haiku-5-5', 10000);
  r := r || 'expired-hold-ignored=' || (res ->> 'ok') || '/' || (select status from public.ai_usage where feature = 'test_old' and cost_micros = 0 and detail = 'reservation expired') || ' ';

  -- bad input
  begin perform public.ai_reserve('system', 'cron', 'x', 'anthropic', 'm', -1); r := r || 'negative-estimate=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'negative-estimate=refused '; end;
  begin perform public.ai_settle(gen_random_uuid(), 1, 1, 0, 0, 1); r := r || 'settle-unknown=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'settle-unknown=refused '; end;
  begin perform public.ai_settle(id1, 1, 1, 0, 0, 1); r := r || 'settle-twice=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'settle-twice=refused '; end;

  -- kill switch
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_kill_switch(true);
  execute 'reset role';
  execute 'set local role service_role';
  res := public.ai_reserve('system', 'cron', 'free_feature', 'anthropic', 'claude-haiku-5-5', 1);
  r := r || 'kill-switch=' || (res ->> 'ok') || '/' || coalesce(res ->> 'reason', '') || ' ';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_ai_kill_switch(false);
  r := r || 'kill-switch-logged=' || (select count(*) from public.finance_log where entity = 'ai' and action in ('kill_switch_on', 'kill_switch_off')) || ' ';

  -- owner edits caps
  perform public.save_ai_budget('feature', 'board', 150, 1200, true);
  r := r || 'owner-saves-cap=' || (select daily_cap_cents || '/' || monthly_cap_cents from public.ai_budgets where scope = 'feature' and scope_key = 'board') || ' ';
  perform public.save_ai_budget('bot', 'roast', null, 300, false);
  r := r || 'owner-adds-bot-cap=' || (select coalesce(daily_cap_cents::text, 'none') || '/' || monthly_cap_cents || '/' || hard_stop from public.ai_budgets where scope = 'bot' and scope_key = 'roast') || ' ';
  begin perform public.save_ai_budget('feature', 'x', 500, 100); r := r || 'daily-over-monthly=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'daily-over-monthly=refused '; end;
  begin perform public.save_ai_budget('feature', 'bad name!', 1, 1); r := r || 'bad-key=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'bad-key=refused '; end;
  begin perform public.save_ai_budget('global', 'other', 1, 1); r := r || 'global-with-name=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'global-with-name=refused '; end;
  begin perform public.delete_ai_budget('global', '*'); r := r || 'delete-global=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'delete-global=refused '; end;
  perform public.delete_ai_budget('bot', 'roast');
  r := r || 'owner-removes-cap=' || (select count(*) from public.ai_budgets where scope = 'bot' and scope_key = 'roast') || ' ';
  sm := public.ai_usage_summary();
  r := r || 'summary=' || (jsonb_array_length(sm -> 'budgets') >= 3)::text || '/' || (sm ->> 'kill_switch') || '/'
         || (select count(*) from jsonb_array_elements(sm -> 'by_feature') f where f ->> 'feature' = 'test_f') || '/'
         || (select count(*) from jsonb_array_elements(sm -> 'by_actor') a where a ->> 'actor_id' = 'agents') || '/'
         || (sm ->> 'refused_24h' <> '0')::text || ' ';
  r := r || 'summary-holds-no-text=' || (sm::text !~* 'prompt|content') || ' ';

  -- an admin reads but cannot write
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.ai_budgets; r := r || 'admin-reads-budgets=' || (n > 0)::text || ' ';
  select count(*) into n from public.ai_usage; r := r || 'admin-reads-usage=' || (n > 0)::text || ' ';
  r := r || 'admin-summary=' || ((public.ai_usage_summary() ->> 'kill_switch') is not null)::text || ' ';
  begin perform public.save_ai_budget('feature', 'board', 1, 1); r := r || 'admin-saves-cap=ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'admin-saves-cap=denied '; end;
  begin perform public.set_ai_kill_switch(true); r := r || 'admin-kill-switch=ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'admin-kill-switch=denied '; end;
  begin perform public.ai_reserve('system', 'x', 'x', 'anthropic', 'm', 1); r := r || 'admin-reserve=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'admin-reserve=denied '; end;
  begin insert into public.ai_usage (actor_type, actor_id, feature, provider, model, status) values ('system', 'x', 'x', 'anthropic', 'm', 'settled'); r := r || 'admin-writes-usage=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'admin-writes-usage=denied '; end;

  -- staff and cleaners see nothing
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.ai_budgets; r := r || 'staff-budgets=' || n || ' ';
  select count(*) into n from public.ai_usage; r := r || 'staff-usage=' || n || ' ';
  select count(*) into n from public.ai_settings; r := r || 'staff-settings=' || n || ' ';
  begin perform public.ai_usage_summary(); r := r || 'staff-summary=ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-summary=denied '; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.ai_budgets; r := r || 'cleaner-budgets=' || n || ' ';
  select count(*) into n from public.ai_usage; r := r || 'cleaner-usage=' || n || ' ';
  begin perform public.set_ai_kill_switch(true); r := r || 'cleaner-kill-switch=ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-kill-switch=denied '; end;

  execute 'reset role';
  execute 'set local role anon';
  begin perform public.ai_reserve('system', 'x', 'x', 'anthropic', 'm', 1); r := r || 'anon-reserve=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-reserve=denied '; end;
  begin perform public.ai_usage_summary(); r := r || 'anon-summary=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-summary=denied '; end;
  begin perform count(*) from public.ai_usage; r := r || 'anon-usage=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-usage=denied '; end;

  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
