-- Bids: versions, margin floor, status moves, lead hand-off, owner/admin only. Rolls back; ALLOWED(BAD) fails.
do $$
declare
  adm uuid := gen_random_uuid(); stf uuid := gen_random_uuid(); cln uuid := gen_random_uuid(); a1 uuid;
  r text := ''; res jsonb; vl uuid; vb uuid; rv int; ts timestamptz; n int; b public.bids%rowtype; ver public.bid_versions%rowtype;
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
  res := public.create_lead('Dana', 'Reyes', '+13325550311', 'dana@gc.example.com', 'commercial', 'referral');
  vl := (res->>'lead_id')::uuid;

  -- first version creates the bid and the company account; cost is summed by the database
  res := public.save_bid_version('Lobby and floors', inputs, lines, 100000, rv, p_lead_id => vl, p_company_name => 'Atlas Builders');
  vb := (res->>'bid_id')::uuid;
  select * into b from public.bids where id = vb;
  select * into ver from public.bid_versions where bid_id = b.id and version = 1;
  r := r || case when b.current_version = 1 and b.status = 'draft' and ver.cost_cents = 64800 and ver.margin_bps = 3520 and ver.rules_version = rv then 'CREATE_V1 ok; ' else 'CREATE_V1 ALLOWED(BAD) ' || coalesce(ver.margin_bps::text, 'null') || '; ' end;
  select count(*) into n from public.accounts a join public.leads l on l.account_id = a.id join public.contacts c on c.account_id = a.id and c.type = 'commercial' where l.id = vl and a.name = 'Atlas Builders';
  r := r || case when n = 1 then 'ACCOUNT_LINKED ok; ' else 'ACCOUNT_LINKED ALLOWED(BAD); ' end;
  r := r || case when ver.rules_snapshot ->> 'version' = rv::text then 'RULES_SNAPSHOT ok; ' else 'RULES_SNAPSHOT ALLOWED(BAD); ' end;

  -- stale version, stale rules, below floor, bad lines
  begin perform public.save_bid_version('x', inputs, lines, 100000, rv, p_bid_id => vb, p_expected_version => 0); r := r || 'STALE_VERSION ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'STALE_VERSION refused; '; end;
  begin perform public.save_bid_version('x', inputs, lines, 100000, rv + 5, p_bid_id => vb, p_expected_version => 1); r := r || 'STALE_RULES ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'STALE_RULES refused; '; end;
  begin perform public.save_bid_version('x', inputs, lines, 70000, rv, p_bid_id => vb, p_expected_version => 1); r := r || 'BELOW_FLOOR ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'BELOW_FLOOR refused; '; end;
  begin perform public.save_bid_version('x', inputs, '[{"label":"","cents":5}]', 100000, rv, p_bid_id => vb, p_expected_version => 1); r := r || 'BAD_LINE ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'BAD_LINE refused; '; end;
  begin perform public.save_bid_version('x', inputs, lines, 0, rv, p_bid_id => vb, p_expected_version => 1); r := r || 'ZERO_PRICE ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'ZERO_PRICE refused; '; end;

  -- below the floor with a reason is kept, and the reason is stored; v1 is untouched
  res := public.save_bid_version('Lobby and floors', inputs, lines, 70000, rv, p_bid_id => vb, p_expected_version => 1, p_floor_override_reason => 'Anchor client, will win the building');
  select * into ver from public.bid_versions where bid_id = vb and version = 2;
  r := r || case when ver.floor_override_reason is not null and ver.margin_bps < 2000 then 'OVERRIDE ok; ' else 'OVERRIDE ALLOWED(BAD); ' end;
  select count(*) into n from public.bid_versions where bid_id = vb and version = 1 and price_cents = 100000;
  r := r || case when n = 1 then 'V1_IMMUTABLE ok; ' else 'V1_IMMUTABLE ALLOWED(BAD); ' end;
  begin update public.bid_versions set price_cents = 1 where bid_id = vb; r := r || 'DIRECT_EDIT ALLOWED(BAD); '; exception when others then r := r || 'DIRECT_EDIT refused; '; end;

  -- ready, then back and a clean third version, then sent
  select updated_at into ts from public.bids where id = vb;
  res := public.set_bid_status(vb, 'ready', ts);
  r := r || case when (select status from public.bids where id = vb) = 'ready' then 'READY ok; ' else 'READY ALLOWED(BAD); ' end;
  begin perform public.set_bid_status(vb, 'ready', (res->>'updated_at')::timestamptz); r := r || 'READY_TWICE ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'READY_TWICE refused; '; end;
  begin perform public.set_bid_status(vb, 'sent', ts - interval '5 seconds'); r := r || 'STALE_STATUS ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'STALE_STATUS refused; '; end;
  res := public.set_bid_status(vb, 'sent', (res->>'updated_at')::timestamptz, current_date + 14);
  select * into b from public.bids where id = vb;
  r := r || case when b.status = 'sent' and b.sent_at is not null and b.valid_until = current_date + 14 then 'SENT ok; ' else 'SENT ALLOWED(BAD); ' end;
  select count(*) into n from public.leads where id = vl and stage = 'quoted' and expected_value_cents = 70000;
  r := r || case when n = 1 then 'LEAD_MOVED_AND_VALUED ok; ' else 'LEAD_MOVED_AND_VALUED ALLOWED(BAD); ' end;
  select count(*) into n from public.activities where lead_id = vl and subject like 'Bid #% version%';
  r := r || case when n = 2 then 'TIMELINE ok; ' else 'TIMELINE ALLOWED(BAD) ' || n || '; ' end;

  -- editing after it went out makes a new draft revision
  res := public.save_bid_version('Lobby and floors', inputs, lines, 100000, rv, p_bid_id => vb, p_expected_version => 2);
  select * into b from public.bids where id = vb;
  r := r || case when b.status = 'draft' and b.current_version = 3 and b.valid_until is null then 'REVISION_IS_DRAFT ok; ' else 'REVISION_IS_DRAFT ALLOWED(BAD); ' end;
  select count(*) into n from public.finance_log where entity = 'bid' and entity_id = vb;
  r := r || case when n = 5 then 'LOGGED ok; ' else 'LOGGED ALLOWED(BAD) ' || n || '; ' end;

  -- a closed bid can't be edited
  reset role;
  update public.bids set status = 'lost' where id = vb;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.save_bid_version('x', inputs, lines, 100000, rv, p_bid_id => vb, p_expected_version => 3); r := r || 'CLOSED_EDIT ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'CLOSED_EDIT refused; '; end;

  -- staff and cleaners see nothing and change nothing
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  select count(*) into n from public.bids;
  r := r || case when n = 0 then 'STAFF_READ ok; ' else 'STAFF_READ ALLOWED(BAD); ' end;
  begin perform public.save_bid_version('x', inputs, lines, 100000, rv, p_lead_id => vl); r := r || 'STAFF_SAVE ALLOWED(BAD); '; exception when others then r := r || 'STAFF_SAVE refused; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cln, 'role', 'authenticated')::text, true);
  select count(*) into n from public.bid_versions;
  r := r || case when n = 0 then 'CLEANER_READ ok; ' else 'CLEANER_READ ALLOWED(BAD); ' end;
  begin perform public.set_bid_status(vb, 'draft', now()); r := r || 'CLEANER_STATUS ALLOWED(BAD); '; exception when others then r := r || 'CLEANER_STATUS refused; '; end;

  raise exception 'RESULTS: %', r;
end $$;
