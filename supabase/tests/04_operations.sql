do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid();
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; c uuid; p uuid; sv uuid; ser uuid;
  ja uuid; jb uuid; jc uuid; a1 uuid; a2 uuid;
  r text := ''; n int; v text; pay bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated'), (u2, 'u2@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps) values ('Ana', 4000) returning id into s1;
  insert into public.subcontractors (display_name, pay_type, pay_rate_cents) values ('Luis', 'hourly', 2500) returning id into s2;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1), (u2, 'subcontractor', 'Luis', s2);
  insert into public.contacts (first_name, last_name, phone) values ('Maria', 'Lopez', '+17185550101') returning id into c;
  insert into public.properties (contact_id, address_line1, zip, borough, access_instructions)
    values (c, '410 5th Ave Apt 3B', '11215', 'brooklyn', 'Lockbox 1234') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Standard clean', 18000, 180) returning id into sv;

  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
    values (c, p, sv, now() + interval '30 minutes', now() + interval '3 hours', 20000) returning id into ja;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
    values (c, p, sv, now() + interval '2 days', now() + interval '2 days 3 hours', 30000) returning id into jb;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
    values (c, p, sv, now() + interval '61 minutes', now() + interval '4 hours', 20000) returning id into jc;

  -- Pay snapshot and math
  insert into public.job_assignments (job_id, subcontractor_id) values (ja, s1) returning id into a1;
  insert into public.job_assignments (job_id, subcontractor_id) values (ja, s2) returning id into a2;
  insert into public.job_assignments (job_id, subcontractor_id) values (jb, s1), (jc, s1);
  select pay_cents into pay from public.job_assignments where id = a1; r := r || 'percent40%of$200=' || pay || ' ';
  select coalesce(pay_cents::text, 'null') into v from public.job_assignments where id = a2; r := r || 'hourly-no-minutes=' || v || ' ';
  update public.job_assignments set minutes_worked = 150 where id = a2;
  select pay_cents into pay from public.job_assignments where id = a2; r := r || 'hourly$25x2.5h=' || pay || ' ';
  update public.jobs set price_cents = 25000 where id = ja;
  select pay_cents into pay from public.job_assignments where id = a1; r := r || 'after-price$250=' || pay || ' ';
  update public.job_assignments set pay_override_cents = 9000 where id = a1;
  select pay_cents into pay from public.job_assignments where id = a1; r := r || 'override=' || pay || ' ';

  -- Series visits are unique per start time
  insert into public.job_series (contact_id, property_id, service_id, recurrence_rule, start_date, local_start_time, duration_minutes, price_cents)
    values (c, p, sv, 'FREQ=WEEKLY;BYDAY=TU', current_date, '09:00', 180, 18000) returning id into ser;
  insert into public.jobs (series_id, contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
    values (ser, c, p, sv, '2026-11-03 14:00+00', '2026-11-03 17:00+00', 18000);
  begin
    insert into public.jobs (series_id, contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
      values (ser, c, p, sv, '2026-11-03 14:00+00', '2026-11-03 17:00+00', 18000);
    r := r || 'dup-visit:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'dup-visit:rejected '; end;

  -- As sub 1
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.my_jobs(); r := r || '| u1 my_jobs=' || n;
  select coalesce(access_instructions, 'hidden') into v from public.my_jobs() where job_id = ja; r := r || ' today-access=' || v;
  select coalesce(access_instructions, 'hidden') into v from public.my_jobs() where job_id = jb; r := r || ' future-access=' || v;
  select client_name into v from public.my_jobs() where job_id = ja; r := r || ' client=' || v;
  select count(*) into n from public.jobs; r := r || ' direct-jobs=' || n;
  select count(*) into n from public.job_assignments; r := r || ' direct-assignments=' || n || ' ';
  begin perform public.complete_job(jc); r := r || 'complete-61min-early:ALLOWED(BAD) ';
  exception when others then r := r || 'complete-61min-early:blocked(' || sqlerrm || ') '; end;
  perform public.complete_job(ja); r := r || 'complete-30min-early:ok ';
  perform public.complete_job(ja); r := r || 'complete-again:no-op ';
  insert into public.job_photos (job_id, storage_path, uploaded_by) values (ja, ja || '/after1.jpg', u1); r := r || 'photo-own-job:ok ';
  begin insert into public.job_photos (job_id, storage_path, uploaded_by) values (ja, ja || '/x.jpg', u2); r := r || 'photo-as-other-uploader:ALLOWED(BAD) ';
  exception when others then r := r || 'photo-as-other-uploader:rejected '; end;
  delete from public.job_photos where job_id = ja; get diagnostics n = row_count; r := r || 'sub-delete-photo rows=' || n || ' ';
  execute 'reset role';
  select status::text into v from public.jobs where id = ja; r := r || 'ja-status=' || v || ' ';

  -- As sub 2
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.my_jobs(); r := r || '| u2 my_jobs=' || n;
  begin perform public.complete_job(jb); r := r || ' complete-unassigned:ALLOWED(BAD)';
  exception when others then r := r || ' complete-unassigned:blocked'; end;
  begin insert into public.job_photos (job_id, storage_path, uploaded_by) values (jb, jb || '/y.jpg', u2); r := r || ' photo-unassigned-job:ALLOWED(BAD)';
  exception when others then r := r || ' photo-unassigned-job:rejected'; end;
  select count(*) into n from public.job_photos; r := r || ' sees-photos-of-ja=' || n || ' ';
  execute 'reset role';

  -- As staff
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.my_jobs(); r := r || '| staff my_jobs=' || n;
  select count(*) into n from public.jobs; r := r || ' staff jobs=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
