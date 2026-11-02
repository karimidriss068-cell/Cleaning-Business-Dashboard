-- Vault screens' read-only data: daily revenue adds up to the month figure the pace uses,
-- revenue by channel needs the office team, and cleaners and anon get nothing.
-- Always rolls back; read the RESULTS line. Any ALLOWED(BAD) is a failure.
do $$
declare
  staff uuid := gen_random_uuid(); cleaner uuid := gen_random_uuid(); a1 uuid;
  r text := ''; j jsonb; today date := (now() at time zone 'America/New_York')::date; month date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
  summed bigint; direct bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (cleaner, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (staff, 'staff', 'S', null), (cleaner, 'subcontractor', 'Ana', a1);

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  j := public.daily_revenue(60);
  r := r || case when jsonb_array_length(j) = 60 then 'DAYS_60 ok; ' else 'DAYS_60 ALLOWED(BAD); ' end;
  r := r || case when (public.daily_revenue(5000) is not null and jsonb_array_length(public.daily_revenue(5000)) = 400) then 'DAYS_CAPPED ok; ' else 'DAYS_CAPPED ALLOWED(BAD); ' end;
  -- the days of this month add up to the same figure as the month's revenue
  select coalesce(sum((e->>'cents')::bigint), 0) into summed from jsonb_array_elements(public.daily_revenue(60)) e where (e->>'day')::date >= month;
  execute 'reset role';
  direct := private.growth_revenue_cents(month, today + 1);
  r := r || case when summed = direct then 'DAYS_ADD_UP ok; ' else 'DAYS_ADD_UP ALLOWED(BAD) ' || summed || '/' || direct || '; ' end;
  execute 'set local role authenticated';
  r := r || case when jsonb_typeof(public.revenue_by_channel(90)) = 'array' then 'CHANNELS ok; ' else 'CHANNELS ALLOWED(BAD); ' end;

  -- cleaner
  perform set_config('request.jwt.claims', json_build_object('sub', cleaner, 'role', 'authenticated')::text, true);
  begin perform public.daily_revenue(10); r := r || 'CLEANER_DAILY ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'CLEANER_DAILY refused; '; end;
  begin perform public.revenue_by_channel(10); r := r || 'CLEANER_CHANNELS ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'CLEANER_CHANNELS refused; '; end;

  execute 'reset role';
  execute 'set local role anon';
  begin perform public.daily_revenue(10); r := r || 'ANON_DAILY ALLOWED(BAD); ';
  exception when others then r := r || 'ANON_DAILY refused; '; end;
  begin perform public.revenue_by_channel(10); r := r || 'ANON_CHANNELS ALLOWED(BAD); ';
  exception when others then r := r || 'ANON_CHANNELS refused; '; end;

  raise exception 'RESULTS: %', r;
end;
$$;
