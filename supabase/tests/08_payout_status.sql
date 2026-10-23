do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid();
  s1 uuid; c uuid; p uuid; sv uuid; j1 uuid; j2 uuid; a1 uuid; a2 uuid;
  po uuid; po2 uuid; po3 uuid; po4 uuid; r text := ''; n int; v text;
  procedure_check text;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (owner, 'owner', 'O'), (staff, 'staff', 'S');
  insert into public.subcontractors (display_name, pay_rate_bps) values ('Ana', 4000) returning id into s1;
  insert into public.contacts (first_name) values ('Maria') returning id into c;
  insert into public.properties (contact_id, address_line1, zip, borough) values (c, '1 Main St', '11215', 'brooklyn') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Standard clean', 18000, 180) returning id into sv;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, now() - interval '3 days', now() - interval '70 hours', 20000, 'completed', now()) returning id into j1;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, now() - interval '2 days', now() - interval '45 hours', 30000, 'completed', now()) returning id into j2;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, s1) returning id into a1;
  insert into public.job_assignments (job_id, subcontractor_id) values (j2, s1) returning id into a2;

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, current_date - 14, current_date) returning id into po;
  insert into public.payout_items (payout_id, job_assignment_id, amount_cents) select po, id, pay_cents from public.job_assignments where id in (a1, a2);

  begin update public.payouts set status = 'paid' where id = po; r := r || 'draft->paid:ALLOWED(BAD) ';
  exception when others then r := r || 'draft->paid:rejected '; end;
  update public.payouts set status = 'approved' where id = po;
  select (approved_at is not null and approved_by = owner)::text into v from public.payouts where id = po; r := r || 'approve-stamped=' || v || ' ';
  update public.payouts set status = 'draft' where id = po;
  select (approved_at is null and approved_by is null)::text into v from public.payouts where id = po; r := r || 'approved->draft-cleared=' || v || ' ';
  update public.payouts set status = 'approved' where id = po;
  update public.payouts set status = 'paid' where id = po;
  select (paid_at is not null)::text into v from public.payouts where id = po; r := r || 'paid-stamped=' || v || ' ';
  begin update public.payouts set notes = 'edit' where id = po; r := r || 'edit-paid:ALLOWED(BAD) ';
  exception when others then r := r || 'edit-paid:rejected '; end;
  begin update public.payouts set status = 'draft' where id = po; r := r || 'paid->draft:ALLOWED(BAD) ';
  exception when others then r := r || 'paid->draft:rejected '; end;
  begin update public.payouts set status = 'approved' where id = po; r := r || 'paid->approved:ALLOWED(BAD) ';
  exception when others then r := r || 'paid->approved:rejected '; end;
  begin delete from public.payouts where id = po; r := r || 'delete-paid:ALLOWED(BAD) ';
  exception when others then r := r || 'delete-paid:rejected '; end;
  begin update public.payouts set status = 'void' where id = po; r := r || 'void-no-reason:ALLOWED(BAD) ';
  exception when check_violation then r := r || 'void-no-reason:rejected '; end;
  begin update public.payouts set status = 'void', void_reason = 'x', notes = 'sneaky' where id = po; r := r || 'void-plus-edit:ALLOWED(BAD) ';
  exception when others then r := r || 'void-plus-edit:rejected '; end;
  update public.payouts set status = 'void', void_reason = 'Wrong period; reissued' where id = po;
  select void_reason || '|by-owner=' || (voided_by = owner) || '|total=' || total_cents into v from public.payouts where id = po;
  r := r || 'paid->void:ok(' || v || ') ';
  select count(*) into n from public.payout_items where payout_id = po and voided; r := r || 'items-voided=' || n || ' ';
  begin update public.payouts set void_reason = 'changed' where id = po; r := r || 'edit-void:ALLOWED(BAD) ';
  exception when others then r := r || 'edit-void:rejected '; end;
  begin update public.payouts set status = 'draft' where id = po; r := r || 'void->draft:ALLOWED(BAD) ';
  exception when others then r := r || 'void->draft:rejected '; end;
  begin delete from public.payouts where id = po; r := r || 'delete-void:ALLOWED(BAD) ';
  exception when others then r := r || 'delete-void:rejected '; end;

  insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, current_date - 13, current_date) returning id into po2;
  insert into public.payout_items (payout_id, job_assignment_id, amount_cents) values (po2, a1, 8000);
  r := r || '| repay-after-void:ok ';
  insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, current_date - 12, current_date) returning id into po3;
  begin insert into public.payout_items (payout_id, job_assignment_id, amount_cents) values (po3, a1, 8000); r := r || 'pay-twice-active:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'pay-twice-active:rejected '; end;
  begin insert into public.payout_items (payout_id, job_assignment_id, amount_cents, voided) values (po3, a2, 12000, true); r := r || 'insert-voided-item:ALLOWED(BAD) ';
  exception when others then r := r || 'insert-voided-item:rejected '; end;
  update public.payouts set status = 'approved' where id = po2;
  update public.payouts set status = 'void', void_reason = 'Duplicate' where id = po2;
  r := r || 'approved->void:ok ';
  delete from public.payouts where id = po3; get diagnostics n = row_count; r := r || 'delete-draft rows=' || n || ' ';
  insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, current_date - 11, current_date) returning id into po4;
  begin update public.payouts set status = 'void', void_reason = 'x' where id = po4; r := r || 'draft->void:ALLOWED(BAD) ';
  exception when others then r := r || 'draft->void:rejected '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.job_assignments set pay_override_cents = 7000 where id = a2; get diagnostics n = row_count;
  r := r || '| staff-edit-pay-of-voided-only rows=' || n;
  update public.payouts set status = 'approved' where id = po4; get diagnostics n = row_count;
  r := r || ' staff-approve rows=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
