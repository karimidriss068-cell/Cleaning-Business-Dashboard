do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); subu uuid := gen_random_uuid();
  s uuid; r text := ''; n int;
begin
  select string_agg(id || ':public=' || public, ' ') into r from storage.buckets;
  r := 'buckets[' || coalesce(r, '') || '] ';
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'),
    (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (subu, 'sub@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (owner, 'owner', 'O'), (staff, 'staff', 'S');

  begin insert into public.subcontractors (display_name, pay_type) values ('No rate', 'percent'); r := r || 'percent-without-bps:ALLOWED(BAD) ';
  exception when check_violation then r := r || 'percent-without-bps:rejected '; end;
  insert into public.subcontractors (display_name, pay_rate_bps, boroughs_served) values ('Ana Ruiz', 4000, '{queens,brooklyn}') returning id into s;
  r := r || 'default pay_type=' || (select pay_type from public.subcontractors where id = s) || ' ';
  begin insert into public.profiles (user_id, role, full_name) values (subu, 'subcontractor', 'Ana'); r := r || 'sub-profile-without-link:ALLOWED(BAD) ';
  exception when check_violation then r := r || 'sub-profile-without-link:rejected '; end;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (subu, 'subcontractor', 'Ana', s);

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.subcontractors; r := r || 'staff sees subs=' || n || ' ';
  update public.subcontractors set pay_rate_bps = 9000 where id = s; get diagnostics n = row_count;
  r := r || 'staff edit pay rows=' || n || ' ';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', subu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || 'sub current_subcontractor_id matches=' || (private.current_subcontractor_id() = s) || ' is_staff=' || private.is_staff() || ' ';
  select count(*) into n from public.subcontractors; r := r || 'sub sees subs table=' || n || ' ';
  select count(*) into n from public.contacts; r := r || 'contacts=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
