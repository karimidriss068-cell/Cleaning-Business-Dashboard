do $$
declare
  staff uuid := gen_random_uuid(); crew uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  s uuid; r text := ''; n int; v text;
begin
  insert into auth.users (id, email, aud, role) values
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (crew, 'c@test.invalid', 'authenticated', 'authenticated'),
    (nobody, 'n@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps) values ('Crew Test', 4000) returning id into s;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (staff, 'staff', 'S', null), (crew, 'subcontractor', 'C', s);

  -- Crew member: create, read, update their own row.
  perform set_config('request.jwt.claims', json_build_object('sub', crew, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.user_preferences (user_id, direction, theme) values (crew, 'ocean', 'light');
  update public.user_preferences set direction = 'midnight' where user_id = crew; get diagnostics n = row_count;
  select direction into v from public.user_preferences where user_id = crew;
  r := r || 'crew-own: update rows=' || n || ' now=' || v || ' ';
  begin insert into public.user_preferences (user_id) values (staff); r := r || 'crew-insert-for-staff:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'crew-insert-for-staff:rejected '; end;
  begin update public.user_preferences set direction = 'gold' where user_id = crew; r := r || 'bad-direction:ALLOWED(BAD) ';
  exception when check_violation then r := r || 'bad-direction:rejected '; end;
  begin delete from public.user_preferences where user_id = crew; r := r || 'delete:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'delete:rejected '; end;
  execute 'reset role';

  -- Staff: own row only; can't read or change the crew member's row.
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.user_preferences (user_id) values (staff);
  select count(*) into n from public.user_preferences; r := r || '| staff sees rows=' || n;
  update public.user_preferences set direction = 'titanium' where user_id = crew; get diagnostics n = row_count;
  r := r || ' staff-update-crew rows=' || n;
  select theme || '/' || direction into v from public.user_preferences where user_id = staff; r := r || ' defaults=' || v || ' ';
  execute 'reset role';

  -- Logged in without a profile: nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', nobody, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.user_preferences (user_id) values (nobody); r := r || '| no-profile-insert:ALLOWED(BAD)';
  exception when insufficient_privilege then r := r || '| no-profile-insert:rejected'; end;
  select count(*) into n from public.user_preferences; r := r || ' no-profile sees=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
