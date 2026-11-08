-- Projects: won bid -> project, milestone invoices, work days with crew, project costs, payout eligibility
-- through the final invoice, and owner/admin-only access. Rolls back; ALLOWED(BAD) fails.
do $$
declare
  adm uuid := gen_random_uuid(); stf uuid := gen_random_uuid(); cln uuid := gen_random_uuid(); a1 uuid;
  r text := ''; res jsonb; vl uuid; vb uuid; vp uuid; rv int; ts timestamptz; n int; p public.projects%rowtype;
  inv1 uuid; inv2 uuid; job uuid; asg uuid; row record; jts timestamptz; pay uuid;
  lines jsonb := '[{"label":"Labor","cents":60000},{"label":"Supplies","cents":4800}]';
  inputs jsonb := '{"areas":[{"label":"Floor 1","spaceType":"office","sqft":8000}],"cleans":1,"crewSize":2,"rush":false,"overrides":{}}';
begin
  insert into auth.users (id, email, aud, role) values
    (adm, 'a@test.invalid', 'authenticated', 'authenticated'), (stf, 's@test.invalid', 'authenticated', 'authenticated'), (cln, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (adm, 'admin', 'A', null), (stf, 'staff', 'S', null), (cln, 'subcontractor', 'Ana', a1);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select version into rv from public.pricing_rules;
  res := public.create_lead('Dana', 'Reyes', '+13325550316', 'dana@gc.example.com', 'commercial', 'referral', 'brooklyn', '5 Court St', '11201');
  vl := (res->>'lead_id')::uuid;
  res := public.save_bid_version('Lobby and floors', inputs, lines, 100000, rv, p_lead_id => vl, p_company_name => 'Atlas Builders');
  vb := (res->>'bid_id')::uuid;
  select updated_at into ts from public.bids where id = vb;

  -- only a sent bid can be won
  begin perform public.create_project_from_bid(vb, ts); r := r || 'DRAFT_BID_WON ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'DRAFT_BID_WON refused; '; end;
  res := public.set_bid_status(vb, 'ready', ts);
  res := public.set_bid_status(vb, 'sent', (res->>'updated_at')::timestamptz);
  ts := (res->>'updated_at')::timestamptz;

  begin perform public.create_project_from_bid(vb, ts - interval '5 seconds'); r := r || 'STALE ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'STALE refused; '; end;
  begin perform public.create_project_from_bid(vb, ts, p_deposit_bps => 12000); r := r || 'BAD_DEPOSIT ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'BAD_DEPOSIT refused; '; end;
  res := public.create_project_from_bid(vb, ts, p_title => 'Atlas lobby clean', p_starts_on => current_date + 7, p_ends_on => current_date + 9);
  vp := (res->>'project_id')::uuid;
  select * into p from public.projects where id = vp;
  r := r || case when p.contract_cents = 100000 and p.deposit_bps = 3000 and p.estimated_cost_cents = 64800 and p.estimated_margin_bps = 3520 and p.title = 'Atlas lobby clean' and p.status = 'scheduled' then 'PROJECT ok; ' else 'PROJECT ALLOWED(BAD); ' end;
  select count(*) into n from public.bids b join public.leads l on l.id = b.lead_id where b.id = vb and b.status = 'won' and l.stage = 'won';
  r := r || case when n = 1 then 'WON_SYNCED ok; ' else 'WON_SYNCED ALLOWED(BAD); ' end;
  select count(*) into n from public.properties pr where pr.id = p.property_id and pr.account_id = p.account_id and pr.address_line1 = '5 Court St' and pr.zip = '11201';
  r := r || case when n = 1 then 'SITE_FROM_CONTACT ok; ' else 'SITE_FROM_CONTACT ALLOWED(BAD); ' end;
  begin perform public.create_project_from_bid(vb, (select updated_at from public.bids where id = vb)); r := r || 'TWO_PROJECTS ALLOWED(BAD); ';
  exception when sqlstate 'KC010' then r := r || 'TWO_PROJECTS refused; '; end;

  -- milestone invoices: deposit is 30% of the contract, final is the rest, never more than the contract
  inv1 := public.create_project_invoice(vp, 'deposit');
  select count(*) into n from public.invoices i join public.invoice_line_items li on li.invoice_id = i.id
    where i.id = inv1 and i.project_id = vp and i.milestone = 'deposit' and i.status = 'draft' and i.subtotal_cents = 30000 and li.unit_price_cents = 30000;
  r := r || case when n = 1 then 'DEPOSIT_30 ok; ' else 'DEPOSIT_30 ALLOWED(BAD); ' end;
  begin perform public.create_project_invoice(vp, 'deposit'); r := r || 'TWO_DEPOSITS ALLOWED(BAD); ';
  exception when sqlstate 'KC010' then r := r || 'TWO_DEPOSITS refused; '; end;
  begin perform public.create_project_invoice(vp, 'progress', 80000); r := r || 'OVER_CONTRACT ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'OVER_CONTRACT refused; '; end;
  begin perform public.create_project_invoice(vp, 'progress'); r := r || 'PROGRESS_NEEDS_AMOUNT ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'PROGRESS_NEEDS_AMOUNT refused; '; end;
  inv2 := public.create_project_invoice(vp, 'final');
  select count(*) into n from public.invoices where id = inv2 and subtotal_cents = 70000 and milestone = 'final';
  r := r || case when n = 1 then 'FINAL_REMAINDER ok; ' else 'FINAL_REMAINDER ALLOWED(BAD); ' end;
  begin perform public.create_project_invoice(vp, 'progress', 100); r := r || 'FULLY_BILLED ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'FULLY_BILLED refused; '; end;

  -- work day, crew and the day's pay
  job := public.schedule_project_day(vp, now() - interval '3 hours', now() - interval '1 hour', 'Strip and wax');
  select count(*) into n from public.jobs where id = job and project_id = vp and price_cents = 0 and status = 'scheduled' and property_id = p.property_id;
  r := r || case when n = 1 then 'WORK_DAY ok; ' else 'WORK_DAY ALLOWED(BAD); ' end;
  begin perform public.schedule_project_day(vp, now(), now() - interval '1 hour'); r := r || 'BAD_DAY ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'BAD_DAY refused; '; end;
  select updated_at into jts from public.jobs where id = job;
  jts := public.assign_project_day(job, jts, array[a1], 22000);
  select a.id into asg from public.job_assignments a where a.job_id = job and a.subcontractor_id = a1;
  select count(*) into n from public.job_assignments where id = asg and pay_cents = 22000;
  r := r || case when n = 1 then 'DAY_PAY ok; ' else 'DAY_PAY ALLOWED(BAD); ' end;
  perform public.set_assignment_pay(asg, 25000);
  select count(*) into n from public.job_assignments where id = asg and pay_cents = 25000;
  r := r || case when n = 1 then 'PAY_CHANGED ok; ' else 'PAY_CHANGED ALLOWED(BAD); ' end;
  begin perform public.create_invoice_from_job(job); r := r || 'INVOICE_WORK_DAY ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'INVOICE_WORK_DAY refused; '; end;

  -- costs tagged on the project
  pay := public.record_project_cost(vp, 'supplies', 12000, current_date, 'Floor wax');
  select count(*) into n from public.expenses where id = pay and project_id = vp and amount_cents = 12000;
  r := r || case when n = 1 then 'PROJECT_COST ok; ' else 'PROJECT_COST ALLOWED(BAD); ' end;
  begin perform public.record_project_cost(vp, 'supplies', 0, current_date, 'x'); r := r || 'ZERO_COST ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'ZERO_COST refused; '; end;
  perform public.delete_project_cost(pay);
  select count(*) into n from public.expenses where id = pay;
  r := r || case when n = 0 then 'COST_DELETED ok; ' else 'COST_DELETED ALLOWED(BAD); ' end;

  -- the cleaner is paid only once the FINAL invoice is paid: complete the day as the owner, then pay
  reset role;
  update public.jobs set status = 'completed', completed_at = now() where id = job;
  select reason_code into row from private.payout_core(null) where assignment_id = asg;
  r := r || case when row.reason_code = 'invoice_draft' then 'PAYOUT_WAITS_FOR_FINAL ok; ' else 'PAYOUT_WAITS_FOR_FINAL ALLOWED(BAD) ' || coalesce(row.reason_code, 'null') || '; ' end;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.send_invoice(inv2, (select updated_at from public.invoices where id = inv2));
  perform public.record_manual_payment(inv2, 70000, 'cash', null, current_date, gen_random_uuid());
  reset role;
  select reason_code into row from private.payout_core(null) where assignment_id = asg;
  r := r || case when row.reason_code is null then 'PAYOUT_AFTER_FINAL_PAID ok; ' else 'PAYOUT_AFTER_FINAL_PAID ALLOWED(BAD) ' || coalesce(row.reason_code, 'null') || '; ' end;

  -- status moves
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select updated_at into ts from public.projects where id = vp;
  begin perform public.set_project_status(vp, 'completed', ts); r := r || 'SKIP_STATUS ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'SKIP_STATUS refused; '; end;
  ts := public.set_project_status(vp, 'in_progress', ts);
  ts := public.set_project_status(vp, 'completed', ts);
  select count(*) into n from public.projects where id = vp and status = 'completed' and completed_at is not null;
  r := r || case when n = 1 then 'COMPLETED ok; ' else 'COMPLETED ALLOWED(BAD); ' end;
  begin perform public.schedule_project_day(vp, now() + interval '1 day', now() + interval '2 days' - interval '20 hours'); r := r || 'DAY_ON_COMPLETED ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'DAY_ON_COMPLETED refused; '; end;
  select count(*) into n from public.finance_log where entity = 'project' and entity_id = vp;
  r := r || case when n >= 8 then 'LOGGED ok; ' else 'LOGGED ALLOWED(BAD) ' || n || '; ' end;

  -- staff and cleaners: nothing
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  select count(*) into n from public.projects;
  r := r || case when n = 0 then 'STAFF_READ ok; ' else 'STAFF_READ ALLOWED(BAD); ' end;
  begin perform public.create_project_invoice(vp, 'progress', 100); r := r || 'STAFF_INVOICE ALLOWED(BAD); '; exception when others then r := r || 'STAFF_INVOICE refused; '; end;
  begin perform public.record_project_cost(vp, 'supplies', 100, current_date, 'x'); r := r || 'STAFF_COST ALLOWED(BAD); '; exception when others then r := r || 'STAFF_COST refused; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cln, 'role', 'authenticated')::text, true);
  select count(*) into n from public.projects;
  r := r || case when n = 0 then 'CLEANER_READ ok; ' else 'CLEANER_READ ALLOWED(BAD); ' end;
  begin perform public.create_project_from_bid(vb, now()); r := r || 'CLEANER_CREATE ALLOWED(BAD); '; exception when others then r := r || 'CLEANER_CREATE refused; '; end;

  raise exception 'RESULTS: %', r;
end $$;
