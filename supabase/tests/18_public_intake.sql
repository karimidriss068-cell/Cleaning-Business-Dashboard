-- Public lead intake: one path with create_lead, duplicates, text consent evidence, bad input,
-- the rate limiter, and who may call what. Always rolls back; any ALLOWED(BAD) is a failure.
do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid();
  s1 uuid; camp uuid; res jsonb; res2 jsonb; r text := ''; n int; c uuid; l uuid; ok boolean;
  v_today date := (now() at time zone 'America/New_York')::date;
  w text := 'I agree to receive texts from Keystone Clean about my request. Msg & data rates may apply. Reply STOP to opt out.';
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana Ruiz', 4000, 'active') returning id into s1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1);
  insert into public.marketing_campaigns (platform, name, status, start_date, channel) values ('google', 'Intake test search', 'active', v_today, 'google_search') returning id into camp;

  execute 'set local role service_role';
  res := public.intake_lead('Dana', 'Lee', '332-555-0391', 'Dana@Example.com', 'residential', 'brooklyn',
    '{"source":"google","medium":"cpc","campaign":"intake test search","content":"Ad A"}', 'https://example.com/clean', true, w, 'v1', repeat('a', 64));
  c := (res ->> 'contact_id')::uuid; l := (res ->> 'lead_id')::uuid;
  r := r || 'new-is-duplicate=' || coalesce((res ->> 'duplicate'), 'NULL') || ' ';
  r := r || 'consent-applied=' || coalesce((res ->> 'consent_applied'), 'NULL') || ' ';
  r := r || 'phone=' || coalesce((select phone from public.contacts where id = c), 'NULL') || ' ';
  r := r || 'email-lower=' || coalesce((select email from public.contacts where id = c), 'NULL') || ' ';
  r := r || 'borough=' || coalesce((select borough::text from public.contacts where id = c), 'NULL') || ' ';
  r := r || 'utm=' || coalesce((select utm_source || '/' || utm_medium || '/' || utm_content from public.contacts where id = c), 'NULL') || ' ';
  r := r || 'lead-source=' || coalesce((select source from public.leads where id = l), 'NULL') || ' ';
  r := r || 'campaign-from-utm=' || coalesce((select (campaign_id = camp)::text from public.leads where id = l), 'NULL') || ' ';
  r := r || 'channel=' || coalesce((select channel from public.leads where id = l), 'NULL') || ' ';
  r := r || 'creative=' || coalesce((select creative from public.leads where id = l), 'NULL') || ' ';
  r := r || 'stage=' || coalesce((select stage::text from public.leads where id = l), 'NULL') || ' ';
  r := r || 'follow-up-today=' || coalesce((select (next_follow_up_on = v_today)::text from public.leads where id = l), 'NULL') || ' ';
  r := r || 'timeline=' || (select count(*) from public.activities where lead_id = l and subject = 'Lead created') || '/' || (select count(*) from public.activities where lead_id = l and type = 'call') || ' ';
  r := r || 'sms-consent=' || coalesce((select sms_consent::text || '/' || sms_consent_source from public.contacts where id = c), 'NULL') || ' ';
  r := r || 'consent-record=' || coalesce((select count(*)::text || '/' || min(wording_version) || '/' || bool_and(applied)::text || '/' || bool_and(wording = w)::text from public.consent_records where contact_id = c), 'NULL') || ' ';

  -- duplicate: same person, different formatting; no second contact, no second open lead, same shape
  res2 := public.intake_lead('Dana', null, '332-555-0391', null, 'recurring', null, '{}', null, true, w, 'v1', null);
  r := r || 'dup-flag=' || coalesce(res2 ->> 'duplicate', 'NULL') || ' ';
  r := r || 'dup-same-contact=' || ((res2 ->> 'contact_id')::uuid = c)::text || ' ';
  r := r || 'dup-same-lead=' || ((res2 ->> 'lead_id')::uuid = l)::text || ' ';
  select count(*) into n from public.contacts where phone = '+13325550391'; r := r || 'contacts-for-phone=' || n || ' ';
  select count(*) into n from public.leads where contact_id = c; r := r || 'leads-for-contact=' || n || ' ';
  r := r || 'dup-note=' || (select count(*) from public.activities where lead_id = l and subject = 'Sent the website form again') || ' ';
  res2 := public.intake_lead('Dana', null, null, 'DANA@example.com', 'residential', null, '{}', null, false, null, null, null);
  r := r || 'dup-by-email=' || ((res2 ->> 'contact_id')::uuid = c)::text || ' ';
  select count(*) into n from public.consent_records where contact_id = c; r := r || 'consent-rows-after-dup=' || n || ' ';
  r := r || 'dup-consent-rows-not-applied=' || (select count(*) from public.consent_records where contact_id = c and not applied) || ' ';

  -- a returning contact whose lead is closed gets a new lead
  update public.leads set stage = 'lost', lost_reason = 'test', closed_at = now() where id = l;
  res2 := public.intake_lead('Dana', null, '3325550391', null, 'residential', null, '{}', null, false, null, null, null);
  r := r || 'closed-lead-gets-new=' || ((res2 ->> 'lead_id')::uuid <> l)::text || ' ';

  -- missing consent: lead is created, no consent flag, no record
  res := public.intake_lead('Eli', 'Roe', '332-555-0344', null, 'commercial', 'manhattan', '{}', null, false, null, null, null);
  c := (res ->> 'contact_id')::uuid;
  r := r || 'noconsent-sms=' || (select sms_consent::text from public.contacts where id = c) || ' ';
  r := r || 'noconsent-records=' || (select count(*) from public.consent_records where contact_id = c) || ' ';
  r := r || 'no-utm-source=' || (select source from public.leads where id = (res ->> 'lead_id')::uuid) || ' ';
  -- consent without wording is refused
  begin
    perform public.intake_lead('Fay', null, '332-555-0345', null, 'residential', null, '{}', null, true, null, null, null);
    r := r || 'consent-without-wording=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'consent-without-wording=refused ';
  end;
  select count(*) into n from public.contacts where phone = '+13325550345'; r := r || 'refused-left-no-contact=' || n || ' ';

  -- a number that already replied STOP never gets the flag
  insert into public.opt_outs (channel, value, source) values ('sms', '+13325550300', 'manual');
  res := public.intake_lead('Gus', null, '332-555-0300', null, 'residential', null, '{}', null, true, w, 'v1', null);
  r := r || 'optedout-applied=' || (res ->> 'consent_applied') || ' ';
  r := r || 'optedout-sms=' || (select sms_consent::text from public.contacts where id = (res ->> 'contact_id')::uuid) || ' ';

  -- bad input is refused with KC005 and writes nothing
  begin perform public.intake_lead('Hal', null, '123', null, 'residential', null, '{}', null, false, null, null, null); r := r || 'bad-phone=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'bad-phone=refused '; end;
  begin perform public.intake_lead('Hal', null, null, null, 'residential', null, '{}', null, false, null, null, null); r := r || 'no-contact-method=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'no-contact-method=refused '; end;
  begin perform public.intake_lead('Hal', null, null, 'not-an-email', 'residential', null, '{}', null, false, null, null, null); r := r || 'bad-email=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'bad-email=refused '; end;
  begin perform public.intake_lead('  ', null, '332-555-0346', null, 'residential', null, '{}', null, false, null, null, null); r := r || 'blank-name=ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'blank-name=refused '; end;
  select count(*) into n from public.contacts where first_name = 'Hal'; r := r || 'bad-input-left-nothing=' || n || ' ';

  -- rate limiter
  r := r || 'rate=' || public.intake_rate_hit('t:a', 2, 600)::text || public.intake_rate_hit('t:a', 2, 600)::text || public.intake_rate_hit('t:a', 2, 600)::text || ' ';
  r := r || 'rate-other-key=' || public.intake_rate_hit('t:b', 2, 600)::text || ' ';
  update public.intake_hits set created_at = now() - interval '20 minutes' where key = 't:a';
  r := r || 'rate-after-window=' || public.intake_rate_hit('t:a', 2, 600)::text || ' ';

  -- staff create_lead still works and still warns about a duplicate
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_lead('Ivy', 'Kim', '332-555-0350', null, 'residential', 'referral');
  r := r || 'staff-create-lead=' || (res ? 'lead_id')::text || ' ';
  begin perform public.create_lead('Ivy', null, '332-555-0350', null, 'residential', 'referral'); r := r || 'staff-dup=ALLOWED(BAD) ';
  exception when sqlstate 'KC010' then r := r || 'staff-dup=KC010 '; end;
  select count(*) into n from public.consent_records; r := r || 'staff-reads-consent=' || (n > 0)::text || ' ';
  select count(*) into n from public.find_lead_duplicates('332-555-0350', null); r := r || 'staff-find-dups=' || n || ' ';

  -- nobody but the server can call the intake or the limiter, or write consent
  begin perform public.intake_lead('X', null, '332-555-0399', null, 'residential', null, '{}', null, false, null, null, null); r := r || 'staff-intake=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-intake=denied '; end;
  begin perform public.intake_rate_hit('x', 1, 1); r := r || 'staff-rate=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-rate=denied '; end;
  begin insert into public.consent_records (contact_id, source, wording_version, wording, applied) select id, 'web_form', 'v1', w, true from public.contacts limit 1; r := r || 'staff-write-consent=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-write-consent=denied '; end;
  begin perform count(*) from public.intake_hits; r := r || 'staff-read-hits=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-read-hits=denied '; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.consent_records; r := r || 'cleaner-reads-consent=' || n || ' ';
  begin perform public.create_lead('Z', null, '332-555-0398', null, 'residential', 'other'); r := r || 'cleaner-create-lead=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'cleaner-create-lead=denied '; end;

  execute 'reset role';
  execute 'set local role anon';
  begin perform public.intake_lead('X', null, '332-555-0397', null, 'residential', null, '{}', null, false, null, null, null); r := r || 'anon-intake=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-intake=denied '; end;
  begin perform public.find_lead_duplicates('332-555-0350', null); r := r || 'anon-find-dups=ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-find-dups=denied '; end;

  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
