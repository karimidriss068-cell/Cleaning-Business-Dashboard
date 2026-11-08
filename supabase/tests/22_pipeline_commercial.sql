-- Bid pipeline: the new stages, the legacy 'contacted' lockout, bid fields through update_lead,
-- account types, and cleaner lockout. Always rolls back; any ALLOWED(BAD) is a failure.
do $$
declare
  staff uuid := gen_random_uuid(); cleaner uuid := gen_random_uuid(); a1 uuid;
  r text := ''; res jsonb; l1 uuid; ts timestamptz; n int; v text; acc uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (cleaner, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (staff, 'staff', 'S', null), (cleaner, 'subcontractor', 'Ana', a1);

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  res := public.create_lead('Mara', 'Ortiz', '+13325550301', 'mara@gc.example.com', 'commercial', 'referral');
  l1 := (res->>'lead_id')::uuid;
  select updated_at into ts from public.leads where id = l1;

  -- the legacy stage can't be stored or chosen
  begin update public.leads set stage = 'contacted' where id = l1; r := r || 'LEGACY_STAGE ALLOWED(BAD); ';
  exception when check_violation then r := r || 'LEGACY_STAGE refused; '; end;

  -- Lead -> Site visit -> Bid sent -> Follow-up -> Won, each on the timeline with its new label
  ts := public.move_lead_stage(l1, ts, 'site_visit');
  ts := public.move_lead_stage(l1, ts, 'quoted');
  ts := public.move_lead_stage(l1, ts, 'follow_up');
  select count(*) into n from public.activities where lead_id = l1 and subject = 'Stage: Lead -> Site visit';
  r := r || case when n = 1 then 'LABEL_SITE_VISIT ok; ' else 'LABEL_SITE_VISIT ALLOWED(BAD); ' end;
  select count(*) into n from public.activities where lead_id = l1 and subject = 'Stage: Site visit -> Bid sent';
  r := r || case when n = 1 then 'LABEL_BID_SENT ok; ' else 'LABEL_BID_SENT ALLOWED(BAD); ' end;
  select count(*) into n from public.activities where lead_id = l1 and subject = 'Stage: Bid sent -> Follow-up';
  r := r || case when n = 1 then 'LABEL_FOLLOW_UP ok; ' else 'LABEL_FOLLOW_UP ALLOWED(BAD); ' end;
  select count(*) into n from public.leads where id = l1 and first_response_at is not null and closed_at is null and stage = 'follow_up';
  r := r || case when n = 1 then 'FOLLOW_UP_STATE ok; ' else 'FOLLOW_UP_STATE ALLOWED(BAD); ' end;
  -- an open lead in Follow-up still counts as an open lead for duplicate matching
  select count(*) into n from public.find_lead_duplicates('+13325550301', null) where open_lead_stage = 'follow_up';
  r := r || case when n = 1 then 'OPEN_INCLUDES_FOLLOW_UP ok; ' else 'OPEN_INCLUDES_FOLLOW_UP ALLOWED(BAD); ' end;

  -- bid fields through update_lead (and nothing outside the allowed list)
  insert into public.accounts (name, account_type, referral_source) values ('Atlas Builders', 'general_contractor', 'Referral from Dan') returning id into acc;
  ts := public.update_lead(l1, ts, jsonb_build_object('bid_due_on', '2099-02-01', 'expected_value_cents', 750000, 'win_probability_bps', 3000, 'account_id', acc, 'site_visit_at', '2099-01-20T14:00:00Z'));
  select count(*) into n from public.leads where id = l1 and bid_due_on = '2099-02-01' and expected_value_cents = 750000 and win_probability_bps = 3000 and account_id = acc and site_visit_at is not null;
  r := r || case when n = 1 then 'BID_FIELDS ok; ' else 'BID_FIELDS ALLOWED(BAD); ' end;
  begin perform public.update_lead(l1, ts, jsonb_build_object('win_probability_bps', 12000)); r := r || 'BAD_PROBABILITY ALLOWED(BAD); ';
  exception when check_violation then r := r || 'BAD_PROBABILITY refused; '; end;
  begin perform public.update_lead(l1, ts, jsonb_build_object('stage', 'won')); r := r || 'STAGE_VIA_PATCH ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'STAGE_VIA_PATCH refused; '; end;
  begin insert into public.accounts (name, account_type) values ('X', 'residential'); r := r || 'ACCOUNT_TYPE ALLOWED(BAD); ';
  exception when check_violation then r := r || 'ACCOUNT_TYPE refused; '; end;

  ts := public.move_lead_stage(l1, ts, 'won');
  select count(*) into n from public.leads where id = l1 and stage = 'won' and closed_at is not null and next_follow_up_on is null;
  r := r || case when n = 1 then 'WON ok; ' else 'WON ALLOWED(BAD); ' end;

  -- cleaners see none of it
  perform set_config('request.jwt.claims', json_build_object('sub', cleaner, 'role', 'authenticated')::text, true);
  select count(*) into n from public.leads;
  r := r || case when n = 0 then 'CLEANER_READ_LEADS ok; ' else 'CLEANER_READ_LEADS ALLOWED(BAD); ' end;
  select count(*) into n from public.accounts;
  r := r || case when n = 0 then 'CLEANER_READ_ACCOUNTS ok; ' else 'CLEANER_READ_ACCOUNTS ALLOWED(BAD); ' end;
  begin perform public.update_lead(l1, now(), jsonb_build_object('expected_value_cents', 1)); r := r || 'CLEANER_UPDATE ALLOWED(BAD); ';
  exception when others then r := r || 'CLEANER_UPDATE refused; '; end;

  raise exception 'RESULTS: %', r;
end $$;
