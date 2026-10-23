-- Always rolls back: ends by raising an exception that carries the results.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  r text := '';
  n int;
  procedure_ok boolean;
begin
  insert into auth.users (id, email, aud, role) values
    (u1, 'owner1@test.invalid', 'authenticated', 'authenticated'),
    (u2, 'owner2@test.invalid', 'authenticated', 'authenticated'),
    (u3, 'nobody@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (u1, 'owner', 'Owner One');

  begin update public.profiles set role = 'admin' where user_id = u1; r := r || 'demote-last:ALLOWED(BAD) ';
  exception when others then r := r || 'demote-last:blocked '; end;
  begin update public.profiles set is_active = false where user_id = u1; r := r || 'deactivate-last:ALLOWED(BAD) ';
  exception when others then r := r || 'deactivate-last:blocked '; end;
  begin delete from public.profiles where user_id = u1; r := r || 'delete-last:ALLOWED(BAD) ';
  exception when others then r := r || 'delete-last:blocked '; end;
  begin delete from auth.users where id = u1; r := r || 'delete-auth-user:ALLOWED(BAD) ';
  exception when others then r := r || 'delete-auth-user:blocked '; end;
  update public.profiles set full_name = 'Owner Uno' where user_id = u1;
  r := r || 'rename-owner:ok ';

  insert into public.profiles (user_id, role, full_name) values (u2, 'owner', 'Owner Two');
  update public.profiles set role = 'admin' where user_id = u1;
  r := r || 'demote-with-second-owner:ok ';

  -- As u1 (now admin): admin can't promote self to owner.
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || 'u1 is_admin=' || private.is_admin() || ' is_staff=' || private.is_staff() || ' ';
  update public.profiles set role = 'owner' where user_id = u1;
  get diagnostics n = row_count;
  r := r || 'admin-self-promote rows=' || n || ' ';
  execute 'reset role';

  -- As u3 (logged in, no profile): sees nothing.
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.profiles;
  r := r || 'no-profile is_member=' || private.is_member() || ' profiles_visible=' || n || ' ';
  execute 'reset role';

  raise exception 'RESULTS: %', r;
end $$;
