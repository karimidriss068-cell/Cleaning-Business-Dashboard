-- Roast Room sessions: owner/admin only (read and write), writes only through functions, the decision
-- log hand-off (summary from the saved synthesis, once per session), bad input, and anon.
-- Always rolls back; read the RESULTS line. Any ALLOWED(BAD) is a failure.
do $$
declare
  owner uuid := gen_random_uuid(); admin uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); cleaner uuid := gen_random_uuid(); a1 uuid;
  r text := ''; n int; sid uuid; sid2 uuid; did uuid; h text := repeat('a', 64);
  syn jsonb := '{"verdict":"Hire a part-time closer first.","summary":"s","actions":[{"title":"Record 10 sales calls","why":"w"},{"title":"Write the script","why":"w"},{"title":"Post the role","why":"w"}]}';
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (admin, 'a@test.invalid', 'authenticated', 'authenticated'),
    (staff, 's@test.invalid', 'authenticated', 'authenticated'), (cleaner, 'c@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana', 4000, 'active') returning id into a1;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (admin, 'admin', 'A', null), (staff, 'staff', 'S', null), (cleaner, 'subcontractor', 'Ana', a1);

  -- owner saves a finished session
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sid := public.save_board_session('Should I hire a closer?', array['cash_ruin','offers_pricing'], 1, true, h, 'done',
    '[{"advisor":"cash_ruin","text":"x"}]', syn, 12000, 8000, null);
  r := r || 'OWNER_SAVE ok; ';
  r := r || case when (select count(*) from public.board_sessions where id = sid) = 1 then 'OWNER_READ ok; ' else 'OWNER_READ ALLOWED(BAD); ' end;
  r := r || case when (select count(*) from public.finance_log where entity = 'board' and entity_id = sid and action = 'session_saved') = 1 then 'SAVE_LOGGED ok; ' else 'SAVE_LOGGED ALLOWED(BAD); ' end;

  -- no direct writes, even for the owner
  begin insert into public.board_sessions (question, advisors, rounds, input_hash, status, est_micros, cost_micros) values ('q', array['a'], 1, h, 'done', 0, 0); r := r || 'DIRECT_INSERT ALLOWED(BAD); ';
  exception when others then r := r || 'DIRECT_INSERT refused; '; end;
  begin update public.board_sessions set cost_micros = 0 where id = sid; r := r || 'DIRECT_UPDATE ALLOWED(BAD); ';
  exception when others then r := r || 'DIRECT_UPDATE refused; '; end;
  begin delete from public.board_sessions where id = sid; r := r || 'DIRECT_DELETE ALLOWED(BAD); ';
  exception when others then r := r || 'DIRECT_DELETE refused; '; end;

  -- bad input
  begin perform public.save_board_session('', array['a'], 1, false, h, 'done', '[]', null, 0, 0, null); r := r || 'EMPTY_Q ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'EMPTY_Q refused; '; end;
  begin perform public.save_board_session(repeat('x', 4001), array['a'], 1, false, h, 'done', '[]', null, 0, 0, null); r := r || 'LONG_Q ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'LONG_Q refused; '; end;
  begin perform public.save_board_session('q', array['a'], 3, false, h, 'done', '[]', null, 0, 0, null); r := r || 'ROUNDS3 ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'ROUNDS3 refused; '; end;
  begin perform public.save_board_session('q', array['a'], 1, false, 'nothex', 'done', '[]', null, 0, 0, null); r := r || 'BAD_HASH ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'BAD_HASH refused; '; end;
  begin perform public.save_board_session('q', array['a'], 1, false, h, 'done', '[]', null, 0, -1, null); r := r || 'NEG_COST ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'NEG_COST refused; '; end;

  -- log to the decision log: action index checked, summary from the saved synthesis, once only
  begin perform public.log_board_decision(sid, 3); r := r || 'BAD_INDEX ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'BAD_INDEX refused; '; end;
  begin perform public.log_board_decision(sid, -1); r := r || 'NEG_INDEX ALLOWED(BAD); ';
  exception when sqlstate 'KC005' then r := r || 'NEG_INDEX refused; '; end;
  did := public.log_board_decision(sid, 1);
  r := r || case when (select decision = 'Write the script' and note like 'Roast Room (AI advisors, not real people): Hire a part-time closer first.' and kind = 'general' from public.growth_decisions where id = did) then 'LOG_DECISION ok; ' else 'LOG_DECISION ALLOWED(BAD); ' end;
  r := r || case when (select logged_decision_id = did from public.board_sessions where id = sid) then 'LINKED ok; ' else 'LINKED ALLOWED(BAD); ' end;
  begin perform public.log_board_decision(sid, 0); r := r || 'LOG_TWICE ALLOWED(BAD); ';
  exception when sqlstate 'KC010' then r := r || 'LOG_TWICE refused; '; end;
  begin perform public.log_board_decision(gen_random_uuid(), 0); r := r || 'LOG_MISSING ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'LOG_MISSING refused; '; end;
  -- a partial session or one without a synthesis cannot be logged
  sid2 := public.save_board_session('Another', array['a'], 1, false, h, 'partial', '[]', null, 100, 0, null);
  begin perform public.log_board_decision(sid2, 0); r := r || 'LOG_PARTIAL ALLOWED(BAD); ';
  exception when sqlstate 'KC004' then r := r || 'LOG_PARTIAL refused; '; end;

  -- admin can read, save, delete
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  r := r || case when (select count(*) from public.board_sessions) >= 2 then 'ADMIN_READ ok; ' else 'ADMIN_READ ALLOWED(BAD); ' end;
  perform public.delete_board_session(sid2);
  r := r || 'ADMIN_DELETE ok; ';
  begin perform public.delete_board_session(sid2); r := r || 'DELETE_TWICE ALLOWED(BAD); ';
  exception when sqlstate 'KC001' then r := r || 'DELETE_TWICE refused; '; end;

  -- staff and cleaners: nothing
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  select count(*) into n from public.board_sessions;
  r := r || case when n = 0 then 'STAFF_READ none; ' else 'STAFF_READ ALLOWED(BAD) ' || n || '; ' end;
  begin perform public.save_board_session('q', array['a'], 1, false, h, 'done', '[]', null, 0, 0, null); r := r || 'STAFF_SAVE ALLOWED(BAD); ';
  exception when others then r := r || 'STAFF_SAVE refused; '; end;
  begin perform public.log_board_decision(sid, 0); r := r || 'STAFF_LOG ALLOWED(BAD); ';
  exception when others then r := r || 'STAFF_LOG refused; '; end;
  begin perform public.delete_board_session(sid); r := r || 'STAFF_DELETE ALLOWED(BAD); ';
  exception when others then r := r || 'STAFF_DELETE refused; '; end;

  perform set_config('request.jwt.claims', json_build_object('sub', cleaner, 'role', 'authenticated')::text, true);
  select count(*) into n from public.board_sessions;
  r := r || case when n = 0 then 'CLEANER_READ none; ' else 'CLEANER_READ ALLOWED(BAD) ' || n || '; ' end;
  begin perform public.save_board_session('q', array['a'], 1, false, h, 'done', '[]', null, 0, 0, null); r := r || 'CLEANER_SAVE ALLOWED(BAD); ';
  exception when others then r := r || 'CLEANER_SAVE refused; '; end;

  -- anon
  execute 'reset role';
  execute 'set local role anon';
  begin perform count(*) from public.board_sessions; r := r || 'ANON_READ ALLOWED(BAD); ';
  exception when others then r := r || 'ANON_READ refused; '; end;
  begin perform public.save_board_session('q', array['a'], 1, false, h, 'done', '[]', null, 0, 0, null); r := r || 'ANON_SAVE ALLOWED(BAD); ';
  exception when others then r := r || 'ANON_SAVE refused; '; end;

  raise exception 'RESULTS: %', r;
end;
$$;
