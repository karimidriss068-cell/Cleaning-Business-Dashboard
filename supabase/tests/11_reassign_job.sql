do $$
declare
  owner uuid := gen_random_uuid(); admin uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); crewu uuid := gen_random_uuid();
  a1 uuid; a2 uuid; a3 uuid; ex uuid; c1 uuid; c2 uuid; ct uuid; p uuid; sv uuid;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid; asg uuid; po uuid;
  t0 timestamptz := date_trunc('hour', now()) + interval '3 days';
  u timestamptz; r text := ''; n int; v text;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (admin, 'a@test.invalid', 'authenticated', 'authenticated'),
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (crewu, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.subcontractors (display_name, pay_type, pay_rate_cents, status) values ('Luis', 'flat', 7500, 'active') returning id into a2;
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Mei', 5000, 'active') returning id into a3;
  insert into public.subcontractors (display_name, pay_rate_bps, coi_expires_on, status) values ('Expired Ed', 4000, current_date - 5, 'active') returning id into ex;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (admin, 'admin', 'A', null), (staff, 'staff', 'S', null), (crewu, 'subcontractor', 'C', a1);
  insert into public.crews (name) values ('Crew A') returning id into c1;
  insert into public.crews (name) values ('Crew B') returning id into c2;
  insert into public.contacts (first_name) values ('Maria') returning id into ct;
  insert into public.properties (contact_id, address_line1, zip, borough) values (ct, '1 Main St', '11215', 'brooklyn') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Standard', 20000, 120) returning id into sv;
  insert into public.jobs (contact_id, property_id, service_id, crew_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, c1, t0, t0 + interval '2 hours', 20000) returning id into j1;
  insert into public.jobs (contact_id, property_id, service_id, crew_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, c2, t0 + interval '1 hour', t0 + interval '3 hours', 20000) returning id into j2;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at) values (ct, p, sv, t0 - interval '5 days', t0 - interval '5 days' + interval '2 hours', 20000, 'completed', now()) returning id into j3;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, t0 + interval '1 day', t0 + interval '1 day 2 hours', 20000) returning id into j4;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, a1), (j2, a2), (j3, a1);
  select id into asg from public.job_assignments where job_id = j3;
  insert into public.payouts (subcontractor_id, period_start, period_end) values (a1, current_date - 14, current_date) returning id into po;
  insert into public.payout_items (payout_id, job_assignment_id, amount_cents) select po, id, pay_cents from public.job_assignments where id = asg;
  -- A second visit that belongs to the approved payout makes it settled.
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (ct, p, sv, t0 + interval '2 days', t0 + interval '2 days 2 hours', 20000, 'scheduled', null) returning id into j3;
  insert into public.job_assignments (job_id, subcontractor_id) values (j3, a1) returning id into asg;
  insert into public.payout_items (payout_id, job_assignment_id, amount_cents) select po, asg, pay_cents from public.job_assignments where id = asg;
  update public.payouts set status = 'approved' where id = po;

  -- Crew login is refused.
  perform set_config('request.jwt.claims', json_build_object('sub', crewu, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select updated_at into u from public.jobs where id = j1; -- crew can't read jobs: u is null
  begin perform public.reassign_job(j1, coalesce(u, now()), c2, array[a3], t0, t0 + interval '2 hours'); r := r || 'crew:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'crew:refused '; end;
  execute 'reset role';

  -- Staff: happy path.
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select updated_at into u from public.jobs where id = j1;
  u := public.reassign_job(j1, u, c2, array[a3, a3], t0 + interval '4 hours', t0 + interval '6 hours');
  select crew_id::text || '|' || scheduled_start::text into v from public.jobs where id = j1;
  r := r || 'move:' || (v = c2::text || '|' || (t0 + interval '4 hours')::text) || ' ';
  select count(*) into n from public.job_assignments where job_id = j1 and subcontractor_id = a3; r := r || 'new-sub=' || n || ' ';
  select count(*) into n from public.job_assignments where job_id = j1 and subcontractor_id = a1; r := r || 'old-sub-gone=' || (n = 0) || ' ';
  select pay_cents into n from public.job_assignments where job_id = j1 and subcontractor_id = a3; r := r || 'pay50%of$200=' || n || ' ';
  select count(*) into n from public.activities where job_id = j1 and subject = 'Visit reassigned'; r := r || 'logged=' || n || ' ';
  -- Staying cleaner keeps their row.
  select id into asg from public.job_assignments where job_id = j1;
  u := public.reassign_job(j1, u, c1, array[a3], t0 + interval '4 hours', t0 + interval '6 hours');
  r := r || 'staying-row-kept=' || exists(select 1 from public.job_assignments where id = asg) || ' ';
  -- Stale edit.
  begin perform public.reassign_job(j1, u - interval '1 second', c1, array[a3], t0, t0 + interval '2 hours'); r := r || 'stale:ALLOWED(BAD) ';
  exception when sqlstate 'KC001' then r := r || 'stale:refused '; end;
  -- Unassign.
  u := public.reassign_job(j4, (select updated_at from public.jobs where id = j4), null, '{}', t0 + interval '1 day', t0 + interval '1 day 2 hours');
  r := r || 'unassigned-ok ';
  -- Not scheduled / settled.
  select updated_at into u from public.jobs where id = j3;
  begin perform public.reassign_job(j3, u, c2, array[a2], t0, t0 + interval '2 hours'); r := r || 'settled:ALLOWED(BAD) ';
  exception when sqlstate 'KC003' then r := r || 'settled:refused '; end;
  -- Double-booking and expired insurance block staff; override needs admin.
  select updated_at into u from public.jobs where id = j4;
  begin perform public.reassign_job(j4, u, c2, array[a2], t0 + interval '1 hour', t0 + interval '3 hours'); r := r || 'double-book:ALLOWED(BAD) ';
  exception when sqlstate 'KC002' then r := r || 'double-book:blocked(' || sqlerrm || ') '; end;
  begin perform public.reassign_job(j4, u, c2, array[ex], t0 + interval '1 day', t0 + interval '1 day 2 hours'); r := r || 'expired-coi:ALLOWED(BAD) ';
  exception when sqlstate 'KC002' then r := r || 'expired-coi:blocked '; end;
  begin perform public.reassign_job(j4, u, c2, array[ex], t0 + interval '1 day', t0 + interval '1 day 2 hours', 'staff tries'); r := r || 'staff-override:ALLOWED(BAD) ';
  exception when sqlstate 'KC002' then r := r || 'staff-override:refused '; end;
  begin perform public.reassign_job(j4, u, c2, array[a2], t0 + interval '1 hour', t0, null); r := r || 'bad-times:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'bad-times:refused '; end;
  execute 'reset role';

  -- Admin override, logged with the reason.
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select updated_at into u from public.jobs where id = j4;
  begin perform public.reassign_job(j4, u, c2, array[ex], t0 + interval '1 day', t0 + interval '1 day 2 hours', '  '); r := r || 'blank-reason:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'blank-reason:refused '; end;
  perform public.reassign_job(j4, u, c2, array[ex], t0 + interval '1 day', t0 + interval '1 day 2 hours', 'Only cleaner free; renewal in progress');
  select count(*) into n from public.activities where job_id = j4 and subject = 'Visit reassigned (override)' and body like '%insurance_expired: Expired Ed%' and body like '%renewal in progress%';
  r := r || 'admin-override-logged=' || n || ' ';
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
