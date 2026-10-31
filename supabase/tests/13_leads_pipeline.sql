-- Leads & Pipeline: stage moves, duplicates, phone normalization, convert, staff-only access.
-- Run inside begin; ... rollback; (see README). Prints RESULTS; any ALLOWED(BAD) is a failure.
do $$
declare
  staff uuid := gen_random_uuid(); cleaner uuid := gen_random_uuid(); a1 uuid;
  r text := ''; res jsonb; l1 uuid; l2 uuid; c1 uuid; ts timestamptz; ts2 timestamptz;
  n int; s public.lead_stage; q record; v text; cu timestamptz;
begin
  insert into auth.users (id, email, aud, role) values
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (cleaner, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (staff, 'staff', 'S', null), (cleaner, 'subcontractor', 'Ana', a1);

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- create: phone normalized, owner + follow-up defaulted, timeline entry written
  res := public.create_lead('Dana', 'Reyes', '(718) 555-0142', 'Dana@Example.com', 'residential', 'google', 'brooklyn', '5 Court St', '11201');
  l1 := (res->>'lead_id')::uuid; c1 := (res->>'contact_id')::uuid;
  select phone into v from public.contacts where id = c1;
  r := r || case when v = '+17185550142' then 'PHONE_NORMALIZED ok; ' else 'PHONE_NORMALIZED ALLOWED(BAD) ' || coalesce(v, 'null') || '; ' end;
  select email into v from public.contacts where id = c1;
  r := r || case when v = 'dana@example.com' then 'EMAIL_LOWER ok; ' else 'EMAIL_LOWER ALLOWED(BAD); ' end;
  select count(*) into n from public.leads where id = l1 and owner_id = staff and next_follow_up_on is not null and stage = 'new';
  r := r || case when n = 1 then 'DEFAULTS ok; ' else 'DEFAULTS ALLOWED(BAD); ' end;
  select count(*) into n from public.activities where lead_id = l1;
  r := r || case when n = 1 then 'CREATE_LOGGED ok; ' else 'CREATE_LOGGED ALLOWED(BAD) ' || n || '; ' end;

  -- bad phone / missing contact method refused
  begin perform public.create_lead('X', null, '12345', null, 'residential', 'other'); r := r || 'BAD_PHONE ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'BAD_PHONE refused; '; end;
  begin perform public.create_lead('X', null, null, null, 'residential', 'other'); r := r || 'NO_CONTACT ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'NO_CONTACT refused; '; end;
  begin perform public.create_lead('X', null, '7185550199', null, 'residential', 'bogus'); r := r || 'BAD_SOURCE ALLOWED(BAD); ';
  exception when check_violation then r := r || 'BAD_SOURCE refused; '; end;

  -- duplicates by phone (any format) and by email; override allowed
  select count(*) into n from public.find_lead_duplicates('+1 718-555-0142', null);
  r := r || case when n = 1 then 'DUP_PHONE ok; ' else 'DUP_PHONE ALLOWED(BAD); ' end;
  select count(*) into n from public.find_lead_duplicates(null, ' DANA@example.com ');
  r := r || case when n = 1 then 'DUP_EMAIL ok; ' else 'DUP_EMAIL ALLOWED(BAD); ' end;
  select count(*) into n from public.find_lead_duplicates('9175550000', 'nobody@example.com');
  r := r || case when n = 0 then 'DUP_NONE ok; ' else 'DUP_NONE ALLOWED(BAD); ' end;
  begin perform public.create_lead('Dana', null, '718-555-0142', null, 'residential', 'other'); r := r || 'DUP_BLOCK ALLOWED(BAD); ';
  exception when sqlstate 'KC010' then r := r || 'DUP_BLOCK refused; '; end;
  res := public.create_lead('Dana', null, '718-555-0142', null, 'recurring', 'referral', p_allow_duplicate => true);
  r := r || case when (res->>'contact_id')::uuid is not null then 'DUP_OVERRIDE ok; ' else 'DUP_OVERRIDE ALLOWED(BAD); ' end;
  -- adding a lead to an existing contact needs no new contact
  select count(*) into n from public.contacts where phone = '+17185550142';
  res := public.create_lead(null, null, null, null, 'recurring', 'referral', p_contact_id => c1);
  l2 := (res->>'lead_id')::uuid;
  r := r || 'EXISTING_CONTACT ok; ';

  -- stage moves: stale guard, lost reason, timestamps, timeline
  select updated_at into ts from public.leads where id = l1;
  begin perform public.move_lead_stage(l1, ts - interval '1 second', 'contacted'); r := r || 'STALE ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'STALE refused; '; end;
  ts := public.move_lead_stage(l1, ts, 'contacted');
  r := r || case when (select first_response_at is not null from public.leads where id = l1) then 'FIRST_RESPONSE ok; ' else 'FIRST_RESPONSE ALLOWED(BAD); ' end;
  begin perform public.move_lead_stage(l1, ts, 'lost'); r := r || 'LOST_NO_REASON ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'LOST_NO_REASON refused; '; end;
  ts := public.move_lead_stage(l1, ts, 'lost', 'Went with another company');
  select stage, lost_reason, closed_at is not null as closed_at, next_follow_up_on is null as next_follow_up_on into q from public.leads where id = l1;
  r := r || case when q.stage = 'lost' and q.lost_reason is not null and q.closed_at and q.next_follow_up_on then 'LOST ok; ' else 'LOST ALLOWED(BAD); ' end;
  ts := public.move_lead_stage(l1, ts, 'new');
  select stage, lost_reason is null as lost_reason, closed_at is null as closed_at into q from public.leads where id = l1;
  r := r || case when q.stage = 'new' and q.lost_reason and q.closed_at then 'REOPEN ok; ' else 'REOPEN ALLOWED(BAD); ' end;
  select count(*) into n from public.activities where lead_id = l1 and type = 'status_change';
  r := r || case when n = 3 then 'MOVES_LOGGED ok; ' else 'MOVES_LOGGED ALLOWED(BAD) ' || n || '; ' end;
  ts2 := public.move_lead_stage(l1, ts, 'new');
  r := r || case when ts2 = ts then 'SAME_STAGE_NOOP ok; ' else 'SAME_STAGE_NOOP ALLOWED(BAD); ' end;

  -- update: whitelisted fields, logged, lead + contact edits
  begin perform public.update_lead(l1, ts, '{"stage":"won"}'::jsonb); r := r || 'PATCH_STAGE ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'PATCH_STAGE refused; '; end;
  ts := public.update_lead(l1, ts, '{"notes":"Prefers mornings","phone":"212 555 0188","next_follow_up_on":"2030-01-02"}'::jsonb);
  select count(*) into n from public.leads l join public.contacts c on c.id = l.contact_id
   where l.id = l1 and l.notes = 'Prefers mornings' and c.phone = '+12125550188' and l.next_follow_up_on = date '2030-01-02';
  r := r || case when n = 1 then 'UPDATE ok; ' else 'UPDATE ALLOWED(BAD); ' end;
  select count(*) into n from public.activities where lead_id = l1 and subject = 'Lead updated';
  r := r || case when n = 1 then 'UPDATE_LOGGED ok; ' else 'UPDATE_LOGGED ALLOWED(BAD); ' end;

  -- convert: customer + draft quote + item, lead contacted, idempotent
  select updated_at into ts from public.leads where id = l1;
  begin perform public.convert_lead(l1, ts - interval '1 second'); r := r || 'CONVERT_STALE ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'CONVERT_STALE refused; '; end;
  res := public.convert_lead(l1, ts);
  select count(*) into n from public.quotes qu join public.quote_items qi on qi.quote_id = qu.id
   where qu.lead_id = l1 and qu.contact_id = c1 and qu.status = 'draft' and qu.id = (res->>'quote_id')::uuid;
  r := r || case when n = 1 then 'CONVERT_QUOTE ok; ' else 'CONVERT_QUOTE ALLOWED(BAD); ' end;
  select customer_since into cu from public.contacts where id = c1;
  r := r || case when cu is not null then 'CUSTOMER_SINCE ok; ' else 'CUSTOMER_SINCE ALLOWED(BAD); ' end;
  select count(*) into n from public.properties where contact_id = c1;
  r := r || case when n = 1 then 'CONVERT_PROPERTY ok; ' else 'CONVERT_PROPERTY ALLOWED(BAD) ' || n || '; ' end;
  select stage into s from public.leads where id = l1;
  r := r || case when s = 'contacted' then 'CONVERT_STAGE ok; ' else 'CONVERT_STAGE ALLOWED(BAD) ' || s || '; ' end;
  res := public.convert_lead(l1, ts);
  select count(*) into n from public.quotes where lead_id = l1;
  r := r || case when (res->>'already')::boolean and n = 1 then 'CONVERT_IDEMPOTENT ok; ' else 'CONVERT_IDEMPOTENT ALLOWED(BAD); ' end;

  -- quote follows the stage: Quote sent -> sent, Booked -> accepted
  select updated_at into ts from public.leads where id = l1;
  ts := public.move_lead_stage(l1, ts, 'quoted');
  select status::text into v from public.quotes where lead_id = l1;
  r := r || case when v = 'sent' then 'QUOTE_SENT ok; ' else 'QUOTE_SENT ALLOWED(BAD) ' || v || '; ' end;
  ts := public.move_lead_stage(l1, ts, 'won');
  select status::text into v from public.quotes where lead_id = l1;
  r := r || case when v = 'accepted' then 'QUOTE_ACCEPTED ok; ' else 'QUOTE_ACCEPTED ALLOWED(BAD) ' || v || '; ' end;

  -- lost leads cannot be converted
  select updated_at into ts from public.leads where id = l2;
  ts := public.move_lead_stage(l2, ts, 'lost', 'No response');
  begin perform public.convert_lead(l2, ts); r := r || 'CONVERT_LOST ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'CONVERT_LOST refused; '; end;

  -- commercial convert makes an account
  res := public.create_lead('Priya', 'Shah', '646-555-0111', 'priya@shahlaw.example', 'commercial', 'referral', 'manhattan', '10 Wall St', '10005');
  res := public.convert_lead((res->>'lead_id')::uuid, (select updated_at from public.leads where id = (res->>'lead_id')::uuid), 'Shah Law');
  select count(*) into n from public.accounts where id = (res->>'account_id')::uuid and name = 'Shah Law';
  r := r || case when n = 1 then 'COMMERCIAL_ACCOUNT ok; ' else 'COMMERCIAL_ACCOUNT ALLOWED(BAD); ' end;

  -- conversion report by source
  select count(*) into n from public.lead_conversion_by_source(current_date - 1, current_date + 1) where source = 'google' and leads = 1 and booked = 1;
  r := r || case when n = 1 then 'REPORT ok; ' else 'REPORT ALLOWED(BAD); ' end;

  -- cleaner: sees nothing, can call nothing
  perform set_config('request.jwt.claims', json_build_object('sub', cleaner, 'role', 'authenticated')::text, true);
  select count(*) into n from public.leads;
  r := r || case when n = 0 then 'CLEANER_READ_LEADS ok; ' else 'CLEANER_READ_LEADS ALLOWED(BAD); ' end;
  select count(*) into n from public.activities;
  r := r || case when n = 0 then 'CLEANER_READ_ACTIVITIES ok; ' else 'CLEANER_READ_ACTIVITIES ALLOWED(BAD); ' end;
  begin perform public.create_lead('Hack', null, '7185550177', null, 'residential', 'other'); r := r || 'CLEANER_CREATE ALLOWED(BAD); ';
  exception when others then r := r || 'CLEANER_CREATE refused; '; end;
  begin perform public.move_lead_stage(l1, now(), 'lost', 'x'); r := r || 'CLEANER_MOVE ALLOWED(BAD); ';
  exception when others then r := r || 'CLEANER_MOVE refused; '; end;
  begin perform public.convert_lead(l1, now()); r := r || 'CLEANER_CONVERT ALLOWED(BAD); ';
  exception when others then r := r || 'CLEANER_CONVERT refused; '; end;
  select count(*) into n from public.find_lead_duplicates('+17185550142', null);
  r := r || case when n = 0 then 'CLEANER_DUPES ok; ' else 'CLEANER_DUPES ALLOWED(BAD); ' end;
  select count(*) into n from public.lead_conversion_by_source(current_date - 1, current_date + 1);
  r := r || case when n = 0 then 'CLEANER_REPORT ok; ' else 'CLEANER_REPORT ALLOWED(BAD); ' end;

  raise exception 'RESULTS: %', r;
end $$;
