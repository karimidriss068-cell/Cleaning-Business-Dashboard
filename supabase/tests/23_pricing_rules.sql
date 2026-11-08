-- Pricing rules: owner/admin only, versioned saves, validation, log. Always rolls back; any ALLOWED(BAD) fails.
do $$
declare
  adm uuid := gen_random_uuid(); stf uuid := gen_random_uuid(); cln uuid := gen_random_uuid(); a1 uuid;
  r text := ''; snap jsonb; v integer; rules jsonb; n int;
begin
  insert into auth.users (id, email, aud, role) values
    (adm, 'a@test.invalid', 'authenticated', 'authenticated'), (stf, 's@test.invalid', 'authenticated', 'authenticated'), (cln, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values (adm, 'admin', 'A', null), (stf, 'staff', 'S', null), (cln, 'subcontractor', 'Ana', a1);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  snap := public.pricing_rules_snapshot();
  r := r || case when (snap->>'version')::int = 1 and (snap->>'confirmed')::boolean = false and jsonb_array_length(snap->'spaceRates') = 6 then 'SNAPSHOT_PLACEHOLDERS ok; ' else 'SNAPSHOT_PLACEHOLDERS ALLOWED(BAD); ' end;
  v := (snap->>'version')::int;
  rules := snap - 'version' - 'confirmed';

  -- a normal save bumps the version, confirms, and writes the log
  v := public.save_pricing_rules(v, rules || jsonb_build_object('marginTargetBps', 3500, 'marginFloorBps', 2500));
  select count(*) into n from public.pricing_rules where version = 2 and margin_target_bps = 3500 and margin_floor_bps = 2500 and confirmed_at is not null;
  r := r || case when v = 2 and n = 1 then 'SAVE ok; ' else 'SAVE ALLOWED(BAD); ' end;
  select count(*) into n from public.finance_log where entity = 'pricing' and action = 'rules_saved' and actor_user_id = adm;
  r := r || case when n = 1 then 'LOGGED ok; ' else 'LOGGED ALLOWED(BAD); ' end;

  -- stale version, floor above target, unknown field, fractional number, missing space type
  begin perform public.save_pricing_rules(1, rules); r := r || 'STALE ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'STALE refused; '; end;
  begin perform public.save_pricing_rules(2, rules || jsonb_build_object('marginTargetBps', 2000, 'marginFloorBps', 3000)); r := r || 'FLOOR_ABOVE_TARGET ALLOWED(BAD); ';
  exception when check_violation then r := r || 'FLOOR_ABOVE_TARGET refused; '; end;
  begin perform public.save_pricing_rules(2, rules || jsonb_build_object('hack', 1)); r := r || 'UNKNOWN_FIELD ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'UNKNOWN_FIELD refused; '; end;
  begin perform public.save_pricing_rules(2, rules || jsonb_build_object('laborRateCents', 25.5)); r := r || 'FRACTION ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'FRACTION refused; '; end;
  begin perform public.save_pricing_rules(2, rules || jsonb_build_object('marginTargetBps', 9500)); r := r || 'MARGIN_100 ALLOWED(BAD); ';
  exception when check_violation then r := r || 'MARGIN_100 refused; '; end;
  begin perform public.save_pricing_rules(2, jsonb_set(rules, '{spaceRates}', (rules->'spaceRates') - 0)); r := r || 'MISSING_SPACE ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'MISSING_SPACE refused; '; end;
  select version into v from public.pricing_rules;
  r := r || case when v = 2 then 'NO_PARTIAL_SAVE ok; ' else 'NO_PARTIAL_SAVE ALLOWED(BAD); ' end;

  -- no direct writes, even for an admin
  begin update public.pricing_rules set margin_floor_bps = 0 where id; get diagnostics n = row_count; r := r || case when n = 0 then 'DIRECT_WRITE refused; ' else 'DIRECT_WRITE ALLOWED(BAD); ' end;
  exception when others then r := r || 'DIRECT_WRITE refused; '; end;

  -- staff and cleaners: see nothing, change nothing
  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  select count(*) into n from public.pricing_rules;
  r := r || case when n = 0 then 'STAFF_READ ok; ' else 'STAFF_READ ALLOWED(BAD); ' end;
  begin perform public.save_pricing_rules(2, rules); r := r || 'STAFF_SAVE ALLOWED(BAD); '; exception when others then r := r || 'STAFF_SAVE refused; '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', cln, 'role', 'authenticated')::text, true);
  select count(*) into n from public.pricing_space_rates;
  r := r || case when n = 0 then 'CLEANER_READ ok; ' else 'CLEANER_READ ALLOWED(BAD); ' end;
  begin perform public.save_pricing_rules(2, rules); r := r || 'CLEANER_SAVE ALLOWED(BAD); '; exception when others then r := r || 'CLEANER_SAVE refused; '; end;

  raise exception 'RESULTS: %', r;
end $$;
