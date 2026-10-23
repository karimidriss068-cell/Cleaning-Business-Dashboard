do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); r text := ''; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (owner, 'owner', 'O'), (staff, 'staff', 'S');

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.goals (metric, period, period_start, period_end, target_value)
    values ('revenue_cents', 'month', '2026-11-01', '2026-11-30', 4500000);
  r := r || 'admin-create:ok ';
  begin insert into public.goals (metric, period, period_start, period_end, target_value)
      values ('revenue_cents', 'month', '2026-11-01', '2026-11-30', 1);
    r := r || 'dup-goal:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'dup-goal:rejected '; end;
  begin insert into public.goals (metric, period, period_start, period_end, target_value)
      values ('leads', 'week', '2026-11-09', '2026-11-02', 40);
    r := r || 'end-before-start:ALLOWED(BAD) ';
  exception when check_violation then r := r || 'end-before-start:rejected '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.goals; r := r || 'staff sees goals=' || n || ' ';
  update public.goals set target_value = 1; get diagnostics n = row_count; r := r || 'staff-edit rows=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
