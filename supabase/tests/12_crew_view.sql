do $$
declare
  staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  a1 uuid; a2 uuid; ct uuid; p uuid; sv uuid; acct uuid;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid; inv uuid; po uuid; asg uuid;
  r text := ''; n int; v text; pay1 bigint; item uuid; item2 uuid;
  tbl text;
begin
  insert into auth.users (id, email, aud, role) values
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (u1, 'u1@test.invalid', 'authenticated', 'authenticated'), (u2, 'u2@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status, coi_expires_on) values ('Ana Ruiz', 4000, 'active', current_date + 20) returning id into a1;
  insert into public.subcontractors (display_name, pay_type, pay_rate_cents, status, coi_expires_on) values ('Luis Fernandez', 'flat', 7500, 'active', current_date + 300) returning id into a2;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', a1), (u2, 'subcontractor', 'Luis', a2);
  insert into public.accounts (name) values ('Secret Corp') returning id into acct;
  insert into public.contacts (first_name, last_name, phone, email) values ('Maria', 'Lopez', '+17185550101', 'maria@example.com') returning id into ct;
  insert into public.properties (contact_id, address_line1, zip, borough, access_instructions) values (ct, '1 Main St', '11215', 'brooklyn', 'Lockbox 1234') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Standard', 20000, 120) returning id into sv;
  insert into public.service_checklist_items (service_id, label, sort_order) values (sv, 'Kitchen', 1), (sv, 'Bathrooms', 2), (sv, 'Floors', 3);
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, now(), now() + interval '2 hours', 20000) returning id into j1;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, now(), now() + interval '2 hours', 30000) returning id into j2;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, now(), now() + interval '2 hours', 25000) returning id into j3;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents) values (ct, p, sv, now() + interval '3 days', now() + interval '3 days 2 hours', 20000) returning id into j4;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, a1), (j2, a2), (j3, a1), (j3, a2), (j4, a1);
  insert into public.invoices (contact_id) values (ct) returning id into inv;
  insert into public.invoice_line_items (invoice_id, job_id, description, unit_price_cents) values (inv, j1, 'Clean', 20000);
  insert into public.payments (invoice_id, amount_cents, status) values (inv, 20000, 'succeeded');
  insert into public.payouts (subcontractor_id, period_start, period_end) values (a2, current_date - 7, current_date) returning id into po;
  select id into asg from public.job_assignments where job_id = j2;
  insert into public.payout_items (payout_id, job_assignment_id, amount_cents) values (po, asg, 7500);
  insert into public.leads (contact_id) values (ct);
  insert into public.quotes (contact_id) values (ct);
  insert into public.job_cleaner_notes (job_id, subcontractor_id, note) values (j2, a2, 'Luis private note');

  ---------------------------------------------------------------- as cleaner 1
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- No office data, ever: every one of these reads returns zero rows.
  foreach tbl in array array['invoices', 'invoice_line_items', 'payments', 'payouts', 'payout_items', 'contacts', 'accounts', 'properties', 'leads',
      'quotes', 'quote_items', 'subcontractors', 'subcontractor_documents', 'crews', 'crew_members', 'services', 'service_checklist_items', 'jobs',
      'job_assignments', 'job_series', 'activities', 'expenses', 'vendors', 'marketing_campaigns', 'goals', 'automations', 'integration_settings',
      'webhook_events', 'opt_outs'] loop
    execute format('select count(*) from public.%I', tbl) into n;
    if n <> 0 then r := r || tbl || '-VISIBLE(BAD)=' || n || ' '; end if;
  end loop;
  r := r || 'office-tables-hidden ';
  select count(*) into n from public.profiles; r := r || 'profiles-visible=' || n || ' ';

  -- Their visits only, with only their own pay.
  select count(*) into n from public.crew_visits(current_date - 1, current_date + 10); r := r || 'my-visits=' || n || ' ';
  select my_pay_cents into pay1 from public.crew_visits(current_date - 1, current_date + 10) where job_id = j1; r := r || 'pay-j1=' || pay1 || ' ';
  select my_pay_cents into pay1 from public.crew_visits(current_date - 1, current_date + 10) where job_id = j3; r := r || 'pay-j3-is-mine(40%of250=10000)=' || pay1 || ' ';
  select array_to_string(teammates, ',') into v from public.crew_visits(current_date - 1, current_date + 10) where job_id = j3; r := r || 'teammates=' || v || ' ';
  select count(*) into n from public.crew_visits(current_date - 1, current_date + 10) where job_id = j2; r := r || 'sees-others-visit=' || n || ' ';
  select coalesce(access_instructions, 'hidden') into v from public.crew_visits(current_date - 1, current_date + 10) where job_id = j1; r := r || 'today-access=' || v || ' ';
  select coalesce(access_instructions, 'hidden') into v from public.crew_visits(current_date - 1, current_date + 10) where job_id = j4; r := r || 'future-access=' || v || ' ';
  select checklist_total into n from public.crew_visits(current_date - 1, current_date + 10) where job_id = j1; r := r || 'checklist-preview=' || n || ' ';

  -- Detail: refused for others' visits; materializes once.
  begin perform public.crew_visit_detail(j2); r := r || 'detail-other:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'detail-other:refused '; end;
  v := (public.crew_visit_detail(j1) -> 'checklist')::text;
  perform public.crew_visit_detail(j1);
  select count(*) into n from public.job_checklist_items where job_id = j1; r := r || 'checklist-items-after-2-opens=' || n || ' ';
  r := r || 'detail-has-no-billing=' || (not (public.crew_visit_detail(j1)::text ~* '(price|invoice|payment|phone|email|last_name|Lopez)'))::text || ' ';

  -- Ticking: own items yes, others no, and no direct writes.
  select id into item from public.job_checklist_items where job_id = j1 order by sort_order limit 1;
  perform public.set_checklist_item(item, true);
  select count(*) into n from public.job_checklist_items where job_id = j1 and done_at is not null; r := r || 'ticked=' || n || ' ';
  perform public.set_checklist_item(item, false);
  select count(*) into n from public.job_checklist_items where job_id = j1 and done_at is not null; r := r || 'unticked=' || n || ' ';
  update public.job_checklist_items set done_at = now() where job_id = j1; get diagnostics n = row_count; r := r || 'direct-update-rows=' || n || ' ';
  execute 'reset role';
  select id into item2 from public.job_checklist_items where job_id = j3 limit 1;
  if item2 is null then
    insert into public.job_checklist_items (job_id, label) values (j2, 'Luis task') returning id into item2;
  end if;
  insert into public.job_checklist_items (job_id, label) values (j2, 'Other cleaner task') on conflict do nothing;
  select id into item2 from public.job_checklist_items where job_id = j2 limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.set_checklist_item(item2, true); r := r || 'tick-other:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'tick-other:refused '; end;
  select count(*) into n from public.job_checklist_items; r := r || 'checklist-rows-visible=' || n || ' ';

  -- Notes: own only.
  insert into public.job_cleaner_notes (job_id, subcontractor_id, note) values (j1, a1, 'Dog is friendly');
  update public.job_cleaner_notes set note = 'Dog is friendly; back door' where job_id = j1 and subcontractor_id = a1; get diagnostics n = row_count; r := r || 'own-note-update=' || n || ' ';
  begin insert into public.job_cleaner_notes (job_id, subcontractor_id, note) values (j1, a2, 'as Luis'); r := r || 'note-as-other:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'note-as-other:rejected '; end;
  begin insert into public.job_cleaner_notes (job_id, subcontractor_id, note) values (j2, a1, 'on a visit not mine'); r := r || 'note-on-unassigned:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'note-on-unassigned:rejected '; end;
  select count(*) into n from public.job_cleaner_notes; r := r || 'notes-visible=' || n || ' ';
  select count(*) into n from public.job_cleaner_notes where subcontractor_id = a2; r := r || 'luis-note-visible=' || n || ' ';
  begin delete from public.job_cleaner_notes where job_id = j1; r := r || 'note-delete:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'note-delete:refused '; end;

  -- Photos: only on their own visits, only as themselves.
  insert into public.job_photos (job_id, storage_path, kind, uploaded_by) values (j1, j1 || '/before1.jpg', 'before', u1);
  begin insert into public.job_photos (job_id, storage_path, kind, uploaded_by) values (j2, j2 || '/x.jpg', 'before', u1); r := r || 'photo-unassigned:ALLOWED(BAD) ';
  exception when others then r := r || 'photo-unassigned:rejected '; end;
  begin insert into public.job_photos (job_id, storage_path, kind, uploaded_by) values (j1, j1 || '/y.jpg', 'after', u2); r := r || 'photo-as-other:ALLOWED(BAD) ';
  exception when others then r := r || 'photo-as-other:rejected '; end;
  select count(*) into n from public.job_photos; r := r || 'photos-visible=' || n || ' ';
  begin insert into storage.objects (bucket_id, name) values ('job-photos', j2 || '/z.jpg'); r := r || 'storage-upload-unassigned:ALLOWED(BAD) ';
  exception when others then r := r || 'storage-upload-unassigned:rejected '; end;
  begin insert into storage.objects (bucket_id, name) values ('job-photos', j1 || '/z.jpg'); r := r || 'storage-upload-own:ok '; exception when others then r := r || 'storage-upload-own:rejected(' || sqlerrm || ') '; end;
  select count(*) into n from storage.objects where bucket_id = 'job-photos'; r := r || 'storage-visible=' || n || ' ';

  -- Insurance reminder data: only their own.
  select count(*) into n from public.crew_me(); r := r || 'crew_me-rows=' || n || ' ';
  select (coi_expires_on = current_date + 20)::text into v from public.crew_me(); r := r || 'own-coi=' || v || ' ';

  -- Completing: too early is refused, in time works.
  begin perform public.complete_job(j4); r := r || 'complete-too-early:ALLOWED(BAD) ';
  exception when others then r := r || 'complete-too-early:refused(' || sqlerrm || ') '; end;
  perform public.complete_job(j1);
  execute 'reset role';
  select status::text into v from public.jobs where id = j1; r := r || 'j1-after-complete=' || v || ' ';

  ---------------------------------------------------------------- as cleaner 2
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.job_cleaner_notes where job_id = j1; r := r || '| luis-sees-ana-note=' || n;
  select count(*) into n from public.job_photos where job_id = j1; r := r || ' luis-sees-ana-photo=' || n;
  select count(*) into n from public.crew_visits(current_date - 1, current_date + 10); r := r || ' luis-visits=' || n;
  execute 'reset role';

  ---------------------------------------------------------------- staff still sees everything
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.job_cleaner_notes; r := r || ' | staff-notes=' || n;
  select count(*) into n from public.job_photos; r := r || ' staff-photos=' || n;
  select count(*) into n from public.crew_visits(current_date - 1, current_date + 10); r := r || ' staff-crew_visits=' || n;
  execute 'reset role';

  select file_size_limit::text || '/' || array_length(allowed_mime_types, 1)::text || '/' || ('application/pdf' = any (allowed_mime_types))::text into v from storage.buckets where id = 'job-photos';
  r := r || ' | bucket(limit/types/pdf)=' || v;
  raise exception 'RESULTS: %', r;
end $$;
