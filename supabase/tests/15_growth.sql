-- Growth goal: who may edit, milestone sync, ad spend, month and window
-- boundaries, lead -> campaign attribution, cash hidden from staff, cleaner lockout.
-- Always rolls back; read the RESULTS line. Any ALLOWED(BAD) is a failure.
do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid();
  s1 uuid; camp uuid; camp2 uuid; sp uuid; sp2 uuid; c uuid; l uuid; sv uuid;
  r text := ''; n int; js jsonb; b0 bigint; b1 bigint;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_month date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
  start0 date;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana Ruiz', 4000, 'active') returning id into s1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1);
  insert into public.marketing_campaigns (platform, name, status, start_date) values ('meta', 'Test meta campaign', 'active', v_today) returning id into camp;
  select start_date into start0 from public.growth_settings where id;

  ----------------------------------------------------------------------- staff: read, never write
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.growth_settings; r := r || 'staff-reads-settings=' || n || ' ';
  js := public.growth_inputs();
  r := r || 'staff-cash-hidden=' || (js -> 'cash' = 'null'::jsonb) || ' ';
  begin perform public.save_growth_plan(start0, 640000, 360000, array[100000,250000,400000,600000,800000,1000000]::bigint[]); r := r || 'staff-save-plan:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-save-plan:rejected '; end;
  begin perform public.save_growth_assumptions(18000, 2, 60000, 2000, 25000, 4000, 100000, 5, 12); r := r || 'staff-save-assumptions:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-save-assumptions:rejected '; end;
  begin perform public.save_cash_settings(500000, v_today, 150000, 100000); r := r || 'staff-save-cash:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-save-cash:rejected '; end;
  begin perform public.record_ad_spend(camp, v_today, 1000); r := r || 'staff-ad-spend:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-ad-spend:rejected '; end;
  begin perform public.create_ad_campaign('meta', 'x'); r := r || 'staff-campaign:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-campaign:rejected '; end;
  begin update public.growth_settings set cac_cents = 1 where id; get diagnostics n = row_count; r := r || 'staff-direct-update-rows=' || n || ' ';
  exception when insufficient_privilege then r := r || 'staff-direct-update:rejected '; end;
  begin perform public.growth_inputs_for_bots(); r := r || 'staff-bot-fn:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-bot-fn:rejected '; end;
  execute 'reset role';

  ----------------------------------------------------------------------- owner: plan and milestones
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  js := public.growth_inputs();
  r := r || 'owner-cash-present=' || (js -> 'cash' <> 'null'::jsonb) || ' ';
  select count(*) into n from public.goals where metric = 'revenue_cents' and period = 'month'; r := r || 'milestones=' || n || ' ';
  begin perform public.save_growth_plan(start0, 640000, 360000, array[100000,250000,400000,600000,800000]::bigint[]); r := r || 'five-milestones:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'five-milestones:rejected '; end;
  begin perform public.save_growth_plan(start0, 640000, 360000, array[100000,250000,200000,600000,800000,1000000]::bigint[]); r := r || 'milestones-go-down:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'milestones-go-down:rejected '; end;
  begin perform public.save_growth_plan(start0, 640000, 360000, array[100000,250000,400000,600000,800000,900000]::bigint[]); r := r || 'last-not-goal:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'last-not-goal:rejected '; end;
  begin perform public.save_growth_plan(start0, 640000, 360000, array[100000,250000,400000,600000,800000,-1]::bigint[]); r := r || 'negative-milestone:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'negative-milestone:rejected '; end;
  -- Move the start two months later, change the goal to $12k and the milestones.
  perform public.save_growth_plan((start0 + interval '2 months')::date, 700000, 500000, array[150000,300000,500000,750000,1000000,1200000]::bigint[]);
  select count(*) into n from public.goals where metric = 'revenue_cents' and period = 'month'; r := r || 'milestones-after=' || n || ' ';
  js := public.growth_inputs();
  r := r || 'first-month-moved=' || ((js -> 'milestones' -> 0 ->> 'monthStart')::date = date_trunc('month', start0 + interval '2 months')::date)
        || ' last=' || (js -> 'milestones' -> 5 ->> 'targetCents') || ' ';
  r := r || 'settings-goal=' || ((js -> 'settings' ->> 'residentialTargetCents')::bigint + (js -> 'settings' ->> 'commercialTargetCents')::bigint) || ' ';
  begin perform public.save_growth_assumptions(0, 2, 60000, 2000, 25000, 4000, 100000, 5, 12); r := r || 'zero-price:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'zero-price:rejected '; end;
  begin perform public.save_growth_assumptions(18000, 2, 60000, 0, 25000, 4000, 100000, 5, 12); r := r || 'zero-close-rate:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'zero-close-rate:rejected '; end;
  perform public.save_growth_assumptions(20000, 3, 70000, 2500, 30000, 5000, 120000, 10, 14);
  js := public.growth_inputs();
  r := r || 'assumptions-saved=' || ((js -> 'settings' ->> 'resVisitPriceCents') || '/' || (js -> 'settings' ->> 'closeRateBps') || '/' || (js -> 'settings' ->> 'cleansPerCleanerPerWeek')) || ' ';
  begin perform public.save_cash_settings(-1, v_today, 150000, 100000); r := r || 'negative-capital:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'negative-capital:rejected '; end;
  perform public.save_cash_settings(500000, v_today, 150000, 100000);
  select count(*) into n from public.finance_log where entity = 'growth'; r := r || 'growth-log=' || n || ' ';

  ----------------------------------------------------------------------- ad spend, month and 30-day boundaries
  b0 := (public.growth_inputs() -> 'ads' ->> 'spendMonthCents')::bigint;
  sp := public.record_ad_spend(camp, (v_month - 1), 5000);        -- last day of last month
  b1 := (public.growth_inputs() -> 'ads' ->> 'spendMonthCents')::bigint;
  r := r || 'prev-month-day-not-in-month=' || (b1 = b0) || ' ';
  sp2 := public.record_ad_spend(camp, v_month, 7000);              -- first day of this month
  b1 := (public.growth_inputs() -> 'ads' ->> 'spendMonthCents')::bigint;
  r := r || 'first-of-month-counts=' || (b1 - b0 = 7000) || ' ';
  b0 := (public.growth_inputs() -> 'ads' ->> 'spend30Cents')::bigint;
  perform public.record_ad_spend(camp, v_today - 30, 1100);        -- 31st day back: outside the window
  b1 := (public.growth_inputs() -> 'ads' ->> 'spend30Cents')::bigint;
  r := r || 'day-31-outside-window=' || (b1 = b0) || ' ';
  perform public.record_ad_spend(camp, v_today - 29, 1300);        -- 30th day: inside
  b1 := (public.growth_inputs() -> 'ads' ->> 'spend30Cents')::bigint;
  r := r || 'day-30-inside-window=' || (b1 - b0 = 1300) || ' ';
  -- Entering a day again replaces it, it does not add.
  perform public.record_ad_spend(camp, v_today - 29, 2000);
  b1 := (public.growth_inputs() -> 'ads' ->> 'spend30Cents')::bigint;
  r := r || 'same-day-replaces=' || (b1 - b0 = 2000) || ' ';
  select count(*) into n from public.marketing_daily_stats where campaign_id = camp and date = v_today - 29; r := r || 'one-row-per-day=' || n || ' ';
  begin perform public.record_ad_spend(camp, v_today + 1, 100); r := r || 'future-date:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'future-date:rejected '; end;
  begin perform public.record_ad_spend(camp, v_today, -5); r := r || 'negative-spend:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'negative-spend:rejected '; end;
  begin perform public.record_ad_spend(gen_random_uuid(), v_today, 100); r := r || 'unknown-campaign:ALLOWED(BAD) ';
  exception when sqlstate 'KC001' then r := r || 'unknown-campaign:rejected '; end;
  perform public.delete_ad_spend(sp2);
  begin perform public.delete_ad_spend(sp2); r := r || 'delete-twice:ALLOWED(BAD) ';
  exception when sqlstate 'KC001' then r := r || 'delete-twice:rejected '; end;
  camp2 := public.create_ad_campaign('meta', '  Spring promo  ');
  begin perform public.create_ad_campaign('meta', '   '); r := r || 'blank-campaign:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'blank-campaign:rejected '; end;
  execute 'reset role';

  ----------------------------------------------------------------------- lead source -> campaign
  insert into public.contacts (first_name, last_name, phone) values ('Test', 'Lead', '+17185550177') returning id into c;
  insert into public.leads (contact_id, source) values (c, 'instagram') returning id into l;
  r := r || 'instagram-lead-gets-a-meta-campaign=' || coalesce((select m.platform = 'meta' from public.leads x join public.marketing_campaigns m on m.id = x.campaign_id where x.id = l), false) || ' ';
  -- A seeded demo campaign is never picked, even when it is the only Meta campaign.
  update public.marketing_campaigns set status = 'paused' where id in (camp, camp2);
  insert into public.leads (contact_id, source) values (c, 'instagram') returning id into l;
  r := r || 'no-real-campaign-leaves-lead-unattributed=' || (select not exists (select 1 from public.marketing_campaigns m where m.id = x.campaign_id and m.id::text not like '5eed0000-%') from public.leads x where x.id = l) || ' ';
  update public.marketing_campaigns set status = 'active' where id in (camp, camp2);
  insert into public.leads (contact_id, source) values (c, 'referral') returning id into l;
  r := r || 'referral-lead-unattributed=' || (select campaign_id is null from public.leads where id = l) || ' ';
  insert into public.leads (contact_id, source, campaign_id) values (c, 'instagram', camp) returning id into l;
  r := r || 'explicit-campaign-kept=' || (select campaign_id = camp from public.leads where id = l) || ' ';

  ----------------------------------------------------------------------- cleaner: nothing
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.growth_settings; r := r || 'cleaner-sees-settings=' || n || ' ';
  begin perform public.growth_inputs(); r := r || 'cleaner-inputs:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-inputs:rejected '; end;
  begin perform public.record_ad_spend(camp, v_today, 100); r := r || 'cleaner-ad-spend:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-ad-spend:rejected '; end;
  execute 'reset role';

  ----------------------------------------------------------------------- anon
  execute 'set local role anon';
  begin perform public.growth_inputs(); r := r || 'anon-inputs:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-inputs:rejected '; end;
  begin perform public.growth_inputs_for_bots(); r := r || 'anon-bot-fn:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'anon-bot-fn:rejected '; end;
  execute 'reset role';

  raise exception 'RESULTS: %', r;
end $$;
