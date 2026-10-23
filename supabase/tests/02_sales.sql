do $$
declare
  staff uuid := gen_random_uuid(); owner uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  c uuid; q uuid; r text := ''; sub bigint; tot bigint; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'),
    (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (nobody, 'n@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (owner, 'owner', 'O'), (staff, 'staff', 'S');

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.contacts (first_name, phone, borough, zip) values ('Maria', '+17185550101', 'brooklyn', '11215') returning id into c;
  insert into public.quotes (contact_id, discount_cents, tax_cents) values (c, 0, 0) returning id into q;
  insert into public.quote_items (quote_id, description, quantity, unit_price_cents) values
    (q, 'Deep clean 2BR', 1, 28500), (q, 'Inside fridge', 2, 3500);
  select subtotal_cents, total_cents into sub, tot from public.quotes where id = q;
  r := r || 'staff: subtotal=' || sub || ' total=' || tot || ' ';
  update public.quotes set discount_cents = 2000, tax_cents = 0 where id = q;
  select total_cents into tot from public.quotes where id = q;
  r := r || 'after $20 discount total=' || tot || ' ';
  delete from public.quote_items where quote_id = q and description = 'Inside fridge';
  select subtotal_cents into sub from public.quotes where id = q;
  r := r || 'after item delete subtotal=' || sub || ' ';
  begin delete from public.contacts where id = c; get diagnostics n = row_count; r := r || 'staff delete contact rows=' || n || ' ';
  exception when others then r := r || 'staff delete contact: ' || sqlerrm || ' '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', nobody, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.quotes; r := r || 'no-profile sees quotes=' || n;
  select count(*) into n from public.contacts; r := r || ' contacts=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
