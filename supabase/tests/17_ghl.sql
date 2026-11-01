-- GoHighLevel: inbound upsert (dedupe, phone, UTM, consent, do-not-disturb), message
-- logging (duplicate, STOP, first human reply), stage echo suppression, the outbound claim
-- (consent, opt-out, dry-run, duplicate), queue backoff, and who may call what.
-- Always rolls back; read the RESULTS line. Any ALLOWED(BAD) is a failure.
do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid();
  s1 uuid; camp uuid; sv uuid; p uuid; c uuid; c2 uuid; l uuid; j uuid; q uuid; stamp timestamptz;
  res jsonb; res2 jsonb; r text := ''; n int;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana Ruiz', 4000, 'active') returning id into s1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1);
  insert into public.marketing_campaigns (platform, name, status, start_date, channel) values ('meta', 'GHL test spring', 'active', v_today, 'meta') returning id into camp;

  ----------------------------------------------------------------------- inbound upsert (service role)
  execute 'set local role service_role';
  res := public.ghl_upsert_lead('ghl-c-1', 'Dana', 'Lee', '(718) 555-0142', 'Dana@Example.com', 'Facebook Ads',
           '{"source":"facebook","campaign":"ghl test spring","content":"Reel Z"}', 'ghl-o-1', 'residential', false, false);
  l := (res ->> 'lead_id')::uuid; c := (res ->> 'contact_id')::uuid;
  r := r || coalesce((coalesce(('created=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'created_lead'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'created_contact'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  res2 := public.ghl_upsert_lead('ghl-c-1', 'Dana', 'Lee', '718-555-0142', null, null, '{}', 'ghl-o-1');
  r := r || coalesce((coalesce(('same-lead-again=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((((res2 ->> 'lead_id')::uuid = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res2 ->> 'created_lead'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  res2 := public.ghl_upsert_lead('ghl-c-other', 'Dana', null, '+1 (718) 555-0142', null);
  r := r || coalesce((coalesce(('same-phone-reuses-contact=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((((res2 ->> 'contact_id')::uuid = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  select count(*) into n from public.contacts where phone = '+17185550142'; r := r || 'one-contact-for-phone=' || n || ' ';
  r := r || coalesce((coalesce(('phone-normalized=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select phone from public.contacts where id = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('email-lowercased=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select email from public.contacts where id = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('lead-source=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select source from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('lead-campaign-from-utm=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select campaign_id = camp from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('lead-channel=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select channel from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('lead-creative=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select creative from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('external-id=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select external_id from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('call-task-exists=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((exists (select 1 from public.activities where lead_id = l and type = 'call'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('follow-up-today=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select next_follow_up_on = v_today from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('no-contact-details:')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((case when (select count(*) from public.leads where contact_id = c) = 1 then 'one-lead' else 'many' end))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  begin perform public.ghl_upsert_lead('ghl-c-bad', 'No', 'Contact', null, null); r := r || 'no-phone-or-email:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'no-phone-or-email:rejected '; end;
  -- consent tag turns consent on; do-not-disturb opts out and turns it off
  perform public.ghl_upsert_lead('ghl-c-1', null, null, null, null, null, '{}', null, null, true, false);
  r := r || coalesce((coalesce(('consent-from-tag=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select sms_consent from public.contacts where id = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.ghl_upsert_lead('ghl-c-1', null, null, null, null, null, '{}', null, null, true, true);
  r := r || coalesce((coalesce(('dnd-clears-consent=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select not sms_consent from public.contacts where id = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/optout=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((exists (select 1 from public.opt_outs where value = '+17185550142'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.ghl_upsert_lead('ghl-c-1', null, null, null, null, null, '{}', null, null, true, false);
  r := r || coalesce((coalesce(('optout-beats-tag=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select not sms_consent from public.contacts where id = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';
  delete from public.opt_outs where value = '+17185550142';

  ----------------------------------------------------------------------- messages
  execute 'set local role service_role';
  res := public.ghl_log_message('ghl-c-1', 'm-1', 'inbound', 'Hi, can I get a quote?', now(), false);
  res2 := public.ghl_log_message('ghl-c-1', 'm-1', 'inbound', 'Hi, can I get a quote?', now(), false);
  r := r || coalesce((coalesce(('message-logged=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'logged'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' duplicate-message=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res2 ->> 'logged'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res2 ->> 'reason'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('unknown-contact-message=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((public.ghl_log_message('nobody', 'm-x', 'inbound', 'hi', now()) ->> 'reason'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.ghl_log_message('ghl-c-1', 'm-2', 'outbound', 'Automated hello', now(), true);
  r := r || coalesce((coalesce(('automated-reply-keeps-first-response-null=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select first_response_at is null from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  stamp := now();
  perform public.ghl_log_message('ghl-c-1', 'm-3', 'outbound', 'Hi Dana, it is Maria calling', stamp, false);
  r := r || coalesce((coalesce(('human-reply-sets-first-response=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select first_response_at = stamp from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.ghl_log_message('ghl-c-1', 'm-4', 'outbound', 'Later reply', stamp + interval '5 minutes', false);
  r := r || coalesce((coalesce(('first-response-not-moved=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select first_response_at = stamp from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.ghl_log_message('ghl-c-1', 'm-5', 'inbound', ' Stop. ', now(), false);
  r := r || coalesce((coalesce(('stop-opts-out=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((exists (select 1 from public.opt_outs where value = '+17185550142' and source = 'stop_keyword'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('stop-clears-consent=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select not sms_consent from public.contacts where id = c))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('timeline-sms-rows=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select count(*) from public.activities where lead_id = l and type = 'sms'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('message-body-not-in-log-id=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select external_id from public.activities where external_id = 'm-1'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');

  ----------------------------------------------------------------------- stage: from GHL (no echo), from the app (queued once)
  res := public.ghl_apply_stage('ghl-o-1', 'quoted');
  r := r || coalesce((coalesce(('stage-from-ghl=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'applied'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select stage from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  res := public.ghl_apply_stage('ghl-o-1', 'quoted');
  r := r || coalesce((coalesce(('stage-repeat-applied=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'applied'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('unknown-opportunity=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((public.ghl_apply_stage('nope', 'won') ->> 'reason'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  select count(*) into n from public.sync_queue where provider = 'ghl'; r := r || 'no-echo-queued=' || n || ' ';
  res := public.ghl_apply_stage('ghl-o-1', 'lost');
  r := r || coalesce((coalesce(('lost-reason-default=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select lost_reason from public.leads where id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';
  -- each request is its own transaction in production; this test is one, so clear the flag by hand
  perform set_config('app.ghl_origin', 'off', true);
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.move_lead_stage(l, (select updated_at from public.leads where id = l), 'contacted');
  perform public.move_lead_stage(l, (select updated_at from public.leads where id = l), 'quoted');
  execute 'reset role';
  select count(*) into n from public.sync_queue where provider = 'ghl' and status = 'pending' and entity_id = l; r := r || 'app-stage-change-queued-once=' || n || ' ';
  select id into q from public.sync_queue where provider = 'ghl' and entity_id = l;

  ----------------------------------------------------------------------- queue backoff
  execute 'set local role service_role';
  update public.sync_queue set attempts = 1 where id = q;
  r := r || coalesce((coalesce(('first-failure=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((public.ghl_queue_fail(q, 'GHL 502'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('backoff-seconds=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select round(extract(epoch from next_attempt_at - now()) / 10) * 10 from public.sync_queue where id = q))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  update public.sync_queue set attempts = max_attempts where id = q;
  r := r || coalesce((coalesce(('out-of-attempts=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((public.ghl_queue_fail(q, 'GHL 502'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';

  ----------------------------------------------------------------------- outbound claim
  insert into public.contacts (first_name, phone, ghl_contact_id) values ('Optin', '+17185550177', 'ghl-c-2') returning id into c2;
  execute 'set local role service_role';
  res := public.ghl_claim_message(p_template => 'review_request', p_dedupe => 'review_request:a', p_contact => c2, p_body => 'hello', p_dry_run => true);
  r := r || coalesce((coalesce(('no-consent-blocked=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'claimed'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'reason'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';
  update public.contacts set sms_consent = true, sms_consent_at = now() where id = c2;
  execute 'set local role service_role';
  res := public.ghl_claim_message(p_template => 'review_request', p_dedupe => 'review_request:b', p_contact => c2, p_body => 'hello', p_dry_run => true);
  r := r || coalesce((coalesce(('dry-run=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'claimed'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'dry_run'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select outcome from public.message_log where dedupe_key = 'review_request:b'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  res := public.ghl_claim_message(p_template => 'review_request', p_dedupe => 'review_request:b', p_contact => c2, p_body => 'hello', p_dry_run => true);
  r := r || coalesce((coalesce(('duplicate-claim=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'claimed'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  res := public.ghl_claim_message(p_template => 'review_request', p_dedupe => 'review_request:c', p_contact => c2, p_body => 'hello', p_dry_run => false);
  r := r || coalesce((coalesce(('live-claim=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'claimed'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.ghl_finish_message((res ->> 'id')::uuid, 'sent', 'm-out-1');
  perform public.ghl_finish_message((res ->> 'id')::uuid, 'failed', null, 'late');
  r := r || coalesce((coalesce(('finish-once=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select outcome from public.message_log where dedupe_key = 'review_request:c'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('sent-text-on-timeline=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((exists (select 1 from public.activities where external_id = 'm-out-1' and contact_id = c2))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('send-counts=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((public.ghl_send_counts(c2) ->> 'contactDay'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((public.ghl_send_counts(c2) ->> 'hour'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';
  insert into public.opt_outs (channel, value, source) values ('sms', '+17185550177', 'manual');
  execute 'set local role service_role';
  res := public.ghl_claim_message(p_template => 'review_request', p_dedupe => 'review_request:d', p_contact => c2, p_body => 'hello', p_dry_run => false);
  r := r || coalesce((coalesce(('opted-out-blocked=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'claimed'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((res ->> 'reason'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';

  -- due messages
  insert into public.properties (contact_id, address_line1, zip, borough) values (c2, '1 Main St', '11215', 'brooklyn') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('GHL test clean', 20000, 180) returning id into sv;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
    values (c2, p, sv, now() + interval '10 hours', now() + interval '13 hours', 20000) returning id into j;
  execute 'set local role service_role';
  r := r || coalesce((coalesce(('due-for-visit=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select string_agg(template_key, ',' order by template_key) from public.ghl_due_messages() where job_id = j))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('due-instant-reply-needs-ghl-contact=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select count(*) from public.ghl_due_messages() where template_key = 'instant_reply' and lead_id = l))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  execute 'reset role';

  ----------------------------------------------------------------------- worker helpers
  execute 'set local role service_role';
  r := r || coalesce((coalesce((public.ghl_can_text(c2))::text, 'NULL'))::text, 'NULL') || coalesce((' ')::text, 'NULL');
  r := r || coalesce(('refresh-unknown-contact=')::text, 'NULL') || coalesce((public.ghl_refresh_contact('nobody'))::text, 'NULL') || coalesce((' ')::text, 'NULL');
  q := (select id from public.sync_queue where provider = 'ghl' limit 1);
  perform public.ghl_queue_defer(q, now() + interval '1 hour');
  r := r || coalesce(('defer-not-claimed=')::text, 'NULL') || coalesce(((select count(*) from public.ghl_claim_queue(10) where id = q))::text, 'NULL') || coalesce((' ')::text, 'NULL');
  update public.sync_queue set next_attempt_at = now() - interval '1 minute', status = 'pending', attempts = 0 where id = q;
  r := r || coalesce(('claim-ghl-queue=')::text, 'NULL') || coalesce(((select count(*) from public.ghl_claim_queue(10) where id = q))::text, 'NULL') || coalesce(('/attempts')::text, 'NULL') || coalesce(((select attempts from public.sync_queue where id = q))::text, 'NULL') || coalesce((' ')::text, 'NULL');
  execute 'reset role';
  update public.contacts set sms_consent = true where id = c2;
  delete from public.opt_outs where value = '+17185550177';
  execute 'set local role service_role';
  r := r || coalesce(('can-text-when-consented=')::text, 'NULL') || coalesce((coalesce((public.ghl_can_text(c2))::text, 'ok'))::text, 'NULL') || coalesce((' ')::text, 'NULL');
  execute 'reset role';
  insert into public.opt_outs (channel, value, source) values ('sms', '+17185550177', 'manual');

  ----------------------------------------------------------------------- who may do what
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.message_templates; r := r || 'staff-reads-templates=' || n || ' ';
  begin perform public.save_message_template('review_request', 'x STOP', 'live'); r := r || 'staff-save-template:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-save-template:rejected '; end;
  begin perform public.ghl_sync_status(); r := r || 'staff-sync-status:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-sync-status:rejected '; end;
  begin perform public.save_ghl_settings(null, '{}', 'dry_run', 'X', 3, 30); r := r || 'staff-save-settings:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-save-settings:rejected '; end;
  begin perform public.ghl_upsert_lead('x', 'a', 'b', '7185550101', null); r := r || 'staff-ghl-upsert:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-ghl-upsert:rejected '; end;
  begin perform public.ghl_claim_message(p_template => 'review_request', p_dedupe => 'z', p_contact => c2, p_body => 'x', p_dry_run => false); r := r || 'staff-ghl-claim:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-ghl-claim:rejected '; end;
  begin update public.message_templates set mode = 'live'; r := r || 'staff-direct-template-update:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-direct-template-update:rejected '; end;
  perform public.set_sms_consent(c2, false, null);
  r := r || coalesce((coalesce(('staff-removes-consent=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select not sms_consent from public.contacts where id = c2))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  begin perform public.set_sms_consent(c2, true, 'staff'); r := r || 'consent-for-opted-out:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'consent-for-opted-out:rejected '; end;

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin perform public.save_message_template('review_request', 'No opt out line', 'live'); r := r || 'live-without-stop:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'live-without-stop:rejected '; end;
  perform public.save_message_template('review_request', 'Thanks! Reply STOP to opt out.', 'live');
  r := r || coalesce((coalesce(('owner-sets-live=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select mode from public.message_templates where key = 'review_request'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  perform public.save_message_template('review_request', 'Thanks! Reply STOP to opt out.', 'dry_run');
  begin perform public.save_ghl_settings(null, '{"bogus":"x"}', 'dry_run', 'X', 3, 30); r := r || 'bad-stage-key:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'bad-stage-key:rejected '; end;
  perform public.save_ghl_settings('pipe-1', '{"new":"s1","won":"s4"}', 'dry_run', 'Keystone Clean', 3, 30);
  r := r || coalesce((coalesce(('owner-sync-status-keys=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select count(*) from jsonb_object_keys(public.ghl_sync_status())))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  r := r || coalesce((coalesce(('defaults-dry-run=')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select count(*) from public.message_templates where mode = 'dry_run'))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(('/')::text, 'NULL'))::text, 'NULL') || coalesce((coalesce(((select opportunity_sync_mode from public.ghl_settings))::text, 'NULL'))::text, 'NULL') || coalesce((coalesce((' ')::text, 'NULL'))::text, 'NULL');
  select count(*) into n from public.finance_log where entity = 'ghl'; r := r || 'ghl-log=' || (n >= 3) || ' ';
  begin perform public.retry_ghl_sync(gen_random_uuid()); r := r || 'retry-unknown:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'retry-unknown:rejected '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.message_templates; r := r || 'cleaner-templates=' || n || ' ';
  select count(*) into n from public.message_log; r := r || 'cleaner-message-log=' || n || ' ';
  select count(*) into n from public.ghl_settings; r := r || 'cleaner-settings=' || n || ' ';
  begin perform public.set_sms_consent(c2, true, 'x'); r := r || 'cleaner-consent:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-consent:rejected '; end;
  execute 'reset role';

  execute 'set local role anon';
  begin perform public.ghl_upsert_lead('x', 'a', 'b', '7185550101', null); r := r || 'anon-upsert:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-upsert:rejected '; end;
  begin perform public.ghl_sync_status(); r := r || 'anon-status:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-status:rejected '; end;
  begin perform public.save_message_template('review_request', 'x', 'dry_run'); r := r || 'anon-template:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-template:rejected '; end;
  execute 'reset role';

  raise exception 'RESULTS: %', r;
end $$;


