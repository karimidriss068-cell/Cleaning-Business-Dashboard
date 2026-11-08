-- Growth part 2: tiers, forecast, gates, hire triggers, decisions, expenses and
-- profit months, channels and funnel, churn, the channel test and its cash-buffer
-- block, and who may do what. Always rolls back; any ALLOWED(BAD) is a failure.
do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid();
  s1 uuid; c uuid; c2 uuid; p uuid; sv uuid; j1 uuid; camp uuid; campg uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; ex uuid; dec uuid; sp uuid;
  r text := ''; n int; js jsonb; b0 bigint; b1 bigint; cash bigint;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_month date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
  v_prev date := (date_trunc('month', (now() at time zone 'America/New_York')) - interval '1 month')::date;
  ch0 jsonb; ch1 jsonb; rb0 jsonb; rb1 jsonb; ck0 int; ck1 int;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana Ruiz', 4000, 'active') returning id into s1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1);
  insert into public.contacts (first_name, last_name, phone, utm_content) values ('Test', 'Won', '+17185550188', 'Before and after reel') returning id into c;
  insert into public.contacts (first_name, last_name, phone) values ('Test', 'Gone', '+17185550189') returning id into c2;
  insert into public.properties (contact_id, address_line1, zip, borough) values (c, '1 Main St', '11215', 'brooklyn') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Test north star clean', 20000, 180) returning id into sv;

  ----------------------------------------------------------------------- staff: read, never write
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.growth_gate_criteria; r := r || 'staff-reads-gates=' || n || ' ';
  select count(*) into n from public.growth_hire_triggers; r := r || 'staff-reads-triggers=' || n || ' ';
  select count(*) into n from public.channel_test_plan; r := r || 'staff-reads-plan=' || n || ' ';
  select count(*) into n from public.expenses; r := r || 'staff-sees-expenses=' || n || ' ';
  js := public.growth_inputs();
  r := r || 'staff-expenses-hidden=' || (js -> 'expenses' = 'null'::jsonb) || ' ';
  r := r || 'staff-cost-lines-hidden=' || ((js -> 'months' -> 12 -> 'subPayCents') = 'null'::jsonb and (js -> 'months' -> 12 -> 'otherCostsCents') = 'null'::jsonb) || ' ';
  r := r || 'staff-cash-on-hand-hidden=' || ((js -> 'cashOnHandCents') = 'null'::jsonb) || ' ';
  begin perform public.save_tier_settings('base', 5000000, 10000000, 5000000); r := r || 'staff-tiers:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-tiers:rejected '; end;
  begin perform public.save_forecast_assumptions(500, 25); r := r || 'staff-forecast:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-forecast:rejected '; end;
  begin perform public.save_gate_criteria('[{"checkpoint":"day30","metric":"reply_minutes","threshold":5,"enabled":true}]'::jsonb); r := r || 'staff-gates:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-gates:rejected '; end;
  begin perform public.save_hire_triggers('[{"key":"clients","label":"x","threshold":1,"enabled":true}]'::jsonb); r := r || 'staff-triggers:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-triggers:rejected '; end;
  begin perform public.add_growth_decision(v_today, 'general', 'n', 'd'); r := r || 'staff-decision:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-decision:rejected '; end;
  begin perform public.record_expense('supplies', 1000, v_today, null); r := r || 'staff-expense:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-expense:rejected '; end;
  begin insert into public.expenses (category, description, amount_cents, incurred_on) values ('supplies', 'x', 100, v_today); r := r || 'staff-direct-expense:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-direct-expense:rejected '; end;
  begin perform public.save_channel_test(75000, 20, 150, 2000, 3000, 4, null, array['meta']); r := r || 'staff-channel-test:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'staff-channel-test:rejected '; end;
  execute 'reset role';

  ----------------------------------------------------------------------- owner: tiers, forecast, gates, triggers, decisions
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.save_tier_settings('base', 5000000, 5000000, 5000000); r := r || 'strong-not-above-base:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'strong-not-above-base:rejected '; end;
  begin perform public.save_tier_settings('gold', 5000000, 10000000, 5000000); r := r || 'unknown-tier:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'unknown-tier:rejected '; end;
  perform public.save_tier_settings('strong', 6000000, 12000000, 4000000);
  js := public.growth_inputs();
  r := r || 'tiers-saved=' || (js -> 'settingsExtra' ->> 'tier') || '/' || (js -> 'settingsExtra' ->> 'tierBaseRevenueCents') || '/' || (js -> 'settingsExtra' ->> 'tierNorthProfitCents') || ' ';
  begin perform public.save_forecast_assumptions(10001, 25); r := r || 'churn-over-100:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'churn-over-100:rejected '; end;
  begin perform public.save_forecast_assumptions(500, 0); r := r || 'zero-crew-cleans:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'zero-crew-cleans:rejected '; end;
  perform public.save_forecast_assumptions(700, 30);
  js := public.growth_inputs();
  r := r || 'forecast-saved=' || (js -> 'settingsExtra' ->> 'monthlyChurnBps') || '/' || (js -> 'settingsExtra' ->> 'cleansPerCrewPerWeek') || ' ';
  r := r || 'gate-rows=' || jsonb_array_length(js -> 'gateCriteria') || ' ';
  begin perform public.save_gate_criteria('[{"checkpoint":"day30","metric":"nope","threshold":1,"enabled":true}]'::jsonb); r := r || 'unknown-gate:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'unknown-gate:rejected '; end;
  begin perform public.save_gate_criteria('[{"checkpoint":"day30","metric":"reply_minutes","threshold":-1,"enabled":true}]'::jsonb); r := r || 'negative-gate:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'negative-gate:rejected '; end;
  perform public.save_gate_criteria('[{"checkpoint":"month3","metric":"month_revenue_cents","threshold":500000,"enabled":true},{"checkpoint":"month3","metric":"payback_tenths","threshold":30,"enabled":false}]'::jsonb);
  select threshold into b0 from public.growth_gate_criteria where checkpoint = 'month3' and metric = 'month_revenue_cents'; r := r || 'gate-threshold-saved=' || b0 || ' ';
  begin perform public.save_hire_triggers('[{"key":"interns","label":"x","threshold":1,"enabled":true}]'::jsonb); r := r || 'unknown-trigger:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'unknown-trigger:rejected '; end;
  perform public.save_hire_triggers('[{"key":"clients","label":"  Hire a scheduler ","threshold":25,"enabled":true}]'::jsonb);
  r := r || 'trigger-saved=' || (select label || '/' || threshold from public.growth_hire_triggers where key = 'clients') || ' ';
  begin perform public.add_growth_decision(v_today + 5, 'general', 'n', 'd'); r := r || 'future-decision:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'future-decision:rejected '; end;
  begin perform public.add_growth_decision(v_today, 'general', '  ', 'd'); r := r || 'blank-note:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'blank-note:rejected '; end;
  dec := public.add_growth_decision(v_today, 'gate', 'Day 30 test done', 'Keep Meta, pause LSA');
  js := public.growth_inputs();
  r := r || 'decision-listed=' || (js -> 'decisions' -> 0 ->> 'decision') || ' ';
  perform public.delete_growth_decision(dec);
  begin perform public.delete_growth_decision(dec); r := r || 'delete-decision-twice:ALLOWED(BAD) '; exception when sqlstate 'KC001' then r := r || 'delete-decision-twice:rejected '; end;

  ----------------------------------------------------------------------- expenses and the profit months
  js := public.growth_inputs();
  r := r || 'months=' || jsonb_array_length(js -> 'months') || ' ';
  b0 := (js -> 'months' -> 12 ->> 'otherCostsCents')::bigint;
  begin perform public.record_expense('supplies', 0, v_today, null); r := r || 'zero-expense:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'zero-expense:rejected '; end;
  begin perform public.record_expense('supplies', 1000, v_today + 1, null); r := r || 'future-expense:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'future-expense:rejected '; end;
  ex := public.record_expense('supplies', 12345, v_month, 'Test mops');
  perform public.record_expense('software', 5000, v_prev + 27, null);   -- late last month: not this month
  js := public.growth_inputs();
  r := r || 'first-of-month-expense-counts=' || (((js -> 'months' -> 12 ->> 'otherCostsCents')::bigint - b0) = 12345) || ' ';
  r := r || 'last-month-expense-in-last-month=' || ((js -> 'months' -> 11 ->> 'otherCostsCents')::bigint >= 5000) || ' ';
  r := r || 'expense-default-description=' || (select description from public.expenses where category = 'software' and amount_cents = 5000 limit 1) || ' ';
  r := r || 'expenses-listed=' || (jsonb_array_length(js -> 'expenses') >= 2) || ' ';
  perform public.delete_expense(ex);
  begin perform public.delete_expense(ex); r := r || 'delete-expense-twice:ALLOWED(BAD) '; exception when sqlstate 'KC001' then r := r || 'delete-expense-twice:rejected '; end;
  -- cleaner pay in the profit month: the pay snapshot on a visit completed this month
  b0 := (public.growth_inputs() -> 'months' -> 12 ->> 'subPayCents')::bigint;
  execute 'reset role';
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, now() - interval '3 hours', now() - interval '1 hour', 20000, 'completed', now() - interval '1 hour') returning id into j1;
  insert into public.job_assignments (job_id, subcontractor_id, pay_override_cents) values (j1, s1, 7777);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b1 := (public.growth_inputs() -> 'months' -> 12 ->> 'subPayCents')::bigint;
  r := r || 'sub-pay-month-counts-the-snapshot=' || (b1 - b0 = 7777) || ' ';

  ----------------------------------------------------------------------- channels, attribution, funnel, reply buckets, churn
  camp := public.create_ad_campaign('meta', 'Test north meta');
  campg := public.create_ad_campaign('google', 'Test north LSA', 'google_lsa');
  r := r || 'campaign-channels=' || (select string_agg(channel, ',' order by channel) from public.marketing_campaigns where id in (camp, campg)) || ' ';
  begin perform public.create_ad_campaign('google', 'Bad channel', 'tiktok'); r := r || 'bad-channel:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'bad-channel:rejected '; end;
  sp := public.record_ad_spend(camp, v_today, 4000, 'Reel A');
  perform public.record_ad_spend(camp, v_today, 1500, 'Reel B');
  perform public.record_ad_spend(camp, v_today, 4500, 'Reel A');   -- replaces Reel A, adds nothing
  select count(*) into n from public.marketing_daily_stats where campaign_id = camp and date = v_today; r := r || 'two-creatives-one-day=' || n || ' ';
  select sum(spend_cents) into b0 from public.marketing_daily_stats where campaign_id = camp and date = v_today; r := r || 'same-creative-replaces=' || b0 || ' ';
  r := r || 'spend-takes-campaign-channel=' || (select channel from public.marketing_daily_stats where id = sp) || ' ';
  ch0 := (public.growth_inputs() -> 'funnel' -> 'channels');
  rb0 := public.growth_inputs() -> 'replyBuckets';
  execute 'reset role';
  -- a lead from the Meta campaign that books, gets its first clean and goes recurring
  insert into public.leads (contact_id, source, campaign_id, stage, first_response_at, created_at)
    values (c, 'instagram', camp, 'won', now() - interval '1 day' + interval '3 minutes', now() - interval '1 day') returning id into l1;
  insert into public.job_series (contact_id, property_id, service_id, recurrence_rule, start_date, local_start_time, duration_minutes, price_cents)
    values (c, p, sv, 'FREQ=WEEKLY', v_today - 5, '09:00', 180, 18000);
  -- an unanswered-then-slow lead from a referral
  insert into public.leads (contact_id, source, stage, first_response_at, created_at)
    values (c2, 'referral', 'site_visit', now() - interval '2 hours' + interval '90 minutes', now() - interval '2 hours') returning id into l2;
  -- two referral leads lost after contact: one went through Quote sent first, one never did
  insert into public.leads (contact_id, source, stage, first_response_at, created_at, closed_at, lost_reason)
    values (c2, 'referral', 'lost', now(), now() - interval '3 hours', now(), 'Too expensive') returning id into l3;
  insert into public.activities (type, subject, lead_id, contact_id) values ('status_change', 'Stage: Contacted -> Quote sent', l3, c2);
  insert into public.activities (type, subject, lead_id, contact_id) values ('status_change', 'Stage: Quote sent -> Lost', l3, c2);
  insert into public.leads (contact_id, source, stage, first_response_at, created_at, closed_at, lost_reason)
    values (c2, 'referral', 'lost', now(), now() - interval '3 hours', now(), 'No answer') returning id into l4;
  insert into public.activities (type, subject, lead_id, contact_id) values ('status_change', 'Stage: New -> Lost', l4, c2);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := r || 'lead-channel-from-campaign=' || (select channel from public.leads where id = l1) || ' ';
  r := r || 'lead-creative-from-utm=' || coalesce((select creative from public.leads where id = l1), 'none') || ' ';
  r := r || 'referral-lead-channel=' || (select channel from public.leads where id = l2) || ' ';
  ch1 := public.growth_inputs() -> 'funnel' -> 'channels';
  r := r || 'meta-funnel-delta=' || (
    select (b ->> 'leads')::int - (a ->> 'leads')::int || '/' || (b ->> 'booked')::int - (a ->> 'booked')::int || '/' || (b ->> 'firstClean')::int - (a ->> 'firstClean')::int || '/' || (b ->> 'recurring')::int - (a ->> 'recurring')::int
    from jsonb_array_elements(ch0) a join jsonb_array_elements(ch1) b on a ->> 'key' = b ->> 'key' where a ->> 'key' = 'meta') || ' ';
  r := r || 'referral-contacted-delta=' || (
    select (b ->> 'contacted')::int - (a ->> 'contacted')::int
    from jsonb_array_elements(ch0) a join jsonb_array_elements(ch1) b on a ->> 'key' = b ->> 'key' where a ->> 'key' = 'referral') || ' ';
  r := r || 'referral-quoted-delta-counts-lost-after-quote=' || (
    select (b ->> 'quoted')::int - (a ->> 'quoted')::int
    from jsonb_array_elements(ch0) a join jsonb_array_elements(ch1) b on a ->> 'key' = b ->> 'key' where a ->> 'key' = 'referral') || ' ';
  r := r || 'meta-spend-in-funnel=' || ((select (b ->> 'spendCents')::bigint from jsonb_array_elements(ch1) b where b ->> 'key' = 'meta') >= 6000) || ' ';
  rb1 := public.growth_inputs() -> 'replyBuckets';
  r := r || 'reply-under5-delta=' || ((rb1 -> 'under5' ->> 'leads')::int - (rb0 -> 'under5' ->> 'leads')::int) || '/booked' || ((rb1 -> 'under5' ->> 'booked')::int - (rb0 -> 'under5' ->> 'booked')::int)
        || ' reply-over60-delta=' || ((rb1 -> 'over60' ->> 'leads')::int - (rb0 -> 'over60' ->> 'leads')::int) || ' ';
  r := r || 'creatives-listed=' || (select count(*) from jsonb_array_elements(public.growth_inputs() -> 'funnel' -> 'creatives') x where x ->> 'key' in ('Reel A', 'Reel B', 'Before and after reel')) || ' ';
  r := r || 'campaign-row=' || (select count(*) from jsonb_array_elements(public.growth_inputs() -> 'funnel' -> 'campaigns') x where x ->> 'key' = camp::text) || ' ';
  -- attribution can be corrected by staff, with a note on the lead
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_lead_attribution(l2, 'google_lsa', '  LSA badge ');
  r := r || 'attribution-set=' || (select channel || '/' || creative from public.leads where id = l2) || ' ';
  begin perform public.set_lead_attribution(l2, 'tiktok', null); r := r || 'bad-attribution:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'bad-attribution:rejected '; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.set_lead_attribution(l2, 'meta', null); r := r || 'cleaner-attribution:ALLOWED(BAD) '; exception when sqlstate 'KC004' then r := r || 'cleaner-attribution:rejected '; end;
  select count(*) into n from public.growth_gate_criteria; r := r || 'cleaner-sees-gates=' || n || ' ';
  select count(*) into n from public.growth_decisions; r := r || 'cleaner-sees-decisions=' || n || ' ';
  select count(*) into n from public.expenses; r := r || 'cleaner-sees-expenses=' || n || ' ';
  execute 'reset role';

  -- churn: one recurring client whose only series ended last month
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  js := public.growth_inputs() -> 'churn'; ck0 := (js -> 4 ->> 'cancellations')::int; b0 := (js -> 4 ->> 'startRecurring')::bigint;
  execute 'reset role';
  insert into public.job_series (contact_id, property_id, service_id, recurrence_rule, start_date, end_date, local_start_time, duration_minutes, price_cents)
    values (c2, p, sv, 'FREQ=WEEKLY', v_prev - 60, v_prev + 10, '09:00', 180, 18000);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  js := public.growth_inputs() -> 'churn';
  r := r || 'churn-months=' || jsonb_array_length(js) || ' ';
  r := r || 'churn-last-month-cancellation-delta=' || ((js -> 4 ->> 'cancellations')::int - ck0) || '/start-delta' || ((js -> 4 ->> 'startRecurring')::bigint - b0) || ' ';

  ----------------------------------------------------------------------- the channel test and the cash buffer
  js := public.growth_inputs();
  cash := (js ->> 'cashOnHandCents')::bigint;
  r := r || 'cash-on-hand-matches-parts=' || (cash = (js -> 'settings' ->> 'startingCapitalCents')::bigint + (js -> 'cash' ->> 'collectedCents')::bigint
                                          - (js -> 'cash' ->> 'payoutsCents')::bigint - (js -> 'cash' ->> 'adSpendCents')::bigint
                                          - (js -> 'cash' ->> 'fixedMonths')::bigint * (js -> 'settings' ->> 'monthlyFixedCostsCents')::bigint) || ' ';
  begin perform public.save_channel_test(75000, 0, 150, 2000, 3000, 4, null, array['meta']); r := r || 'judge-leads-zero:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'judge-leads-zero:rejected '; end;
  begin perform public.save_channel_test(75000, 20, 100, 2000, 3000, 4, null, array['meta']); r := r || 'loser-ratio-1x:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'loser-ratio-1x:rejected '; end;
  begin perform public.save_channel_test(75000, 20, 150, 2000, 3000, 4, null, array['referral']); r := r || 'unpaid-channel:ALLOWED(BAD) '; exception when sqlstate 'KC005' then r := r || 'unpaid-channel:rejected '; end;
  begin perform public.save_channel_test(75000, 20, 150, 99999999, 99999999, 26, null, array['meta', 'google_search', 'google_lsa']); r := r || 'over-buffer-plan:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'over-buffer-plan:rejected '; end;
  -- the defaults: 3 channels x 7 x (2000 + 3 x 3000) = 231,000 cents; fits while cash above the buffer allows it
  perform public.save_cash_settings(500000, v_today, 150000, 100000);
  js := public.growth_inputs(); cash := (js ->> 'cashOnHandCents')::bigint;
  r := r || 'room-for-default-test=' || (cash - 100000 >= 231000) || ' ';
  perform public.save_channel_test(75000, 20, 150, 2000, 3000, 4, null, array['meta', 'google_search', 'google_lsa']);
  select count(*) into n from public.channel_test_plan where enabled; r := r || 'plan-enabled=' || n || ' ';
  perform public.save_channel_test(80000, 25, 200, 2000, 3000, 4, v_today, array['meta']);
  js := public.growth_inputs();
  r := r || 'test-rules-saved=' || (js -> 'settingsExtra' ->> 'testJudgeSpendCents') || '/' || (js -> 'settingsExtra' ->> 'testJudgeLeads') || '/' || (js -> 'settingsExtra' ->> 'testLoserRatioX100') || '/' || (js -> 'settingsExtra' ->> 'testStartDate') || ' ';
  select count(*) into n from public.channel_test_plan where enabled; r := r || 'plan-enabled-after=' || n || ' ';
  r := r || 'test-channel-stats=' || (select count(*) from jsonb_array_elements(js -> 'channelTest' -> 'channels')) || ' ';
  -- raise the buffer above what cash can cover: any planned spend is blocked, an empty plan is not
  perform public.save_cash_settings(500000, v_today, 150000, 99999999);
  begin perform public.save_channel_test(75000, 20, 150, 2000, 3000, 4, null, array['meta']); r := r || 'buffer-blocks-plan:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'buffer-blocks-plan:rejected(' || (case when sqlerrm like '%buffer%' then 'mentions-buffer' else sqlerrm end) || ') '; end;
  perform public.save_channel_test(75000, 20, 150, 2000, 3000, 4, null, array[]::text[]);
  r := r || 'empty-plan-saves-under-buffer=true ';
  select count(*) into n from public.finance_log where entity = 'growth'; r := r || 'growth-log=' || (n >= 10) || ' ';
  execute 'reset role';

  ----------------------------------------------------------------------- anon
  execute 'set local role anon';
  begin perform public.save_tier_settings('base', 1, 2, 1); r := r || 'anon-tiers:ALLOWED(BAD) '; exception when insufficient_privilege then r := r || 'anon-tiers:rejected '; end;
  begin perform public.record_expense('supplies', 1, v_today, null); r := r || 'anon-expense:ALLOWED(BAD) '; exception when insufficient_privilege then r := r || 'anon-expense:rejected '; end;
  begin perform public.set_lead_attribution(l1, 'meta', null); r := r || 'anon-attribution:ALLOWED(BAD) '; exception when insufficient_privilege then r := r || 'anon-attribution:rejected '; end;
  begin perform public.save_channel_test(1, 1, 150, 0, 0, 1, null, array[]::text[]); r := r || 'anon-channel-test:ALLOWED(BAD) '; exception when insufficient_privilege then r := r || 'anon-channel-test:rejected '; end;
  execute 'reset role';

  raise exception 'RESULTS: %', r;
end $$;
