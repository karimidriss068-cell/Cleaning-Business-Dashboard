do $$
declare
  staff uuid := gen_random_uuid(); nobody uuid := gen_random_uuid(); r text := ''; v boolean;
  sub_user uuid := (select id from auth.users where email = 'seed+ana@example.com');
begin
  insert into auth.users (id, email, aud, role) values
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (nobody, 'n@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (staff, 'staff', 'S');

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || 'staff=' || public.demo_data_present() || ' ';
  execute 'reset role';

  if sub_user is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', sub_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    r := r || 'crew=' || public.demo_data_present() || ' ';
    execute 'reset role';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', nobody, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || 'no-profile=' || public.demo_data_present() || ' ';
  execute 'reset role';

  -- With no seed rows, staff sees false.
  raise exception 'RESULTS: %', r;
end $$;
