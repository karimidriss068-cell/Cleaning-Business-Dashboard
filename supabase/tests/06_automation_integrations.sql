do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid();
  r text := ''; n int; v text; au uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (owner, 'owner', 'O'), (staff, 'staff', 'S');

  -- Vault round trip, as the service role
  execute 'set local role service_role';
  perform public.set_integration_secret('test_provider', 'tok_first');
  r := r || 'get=' || public.get_integration_secret('test_provider') || ' ';
  perform public.set_integration_secret('test_provider', 'tok_rotated');
  r := r || 'after-rotate=' || public.get_integration_secret('test_provider') || ' ';
  select count(*) into n from public.integration_settings where provider = 'test_provider'; r := r || 'rows=' || n || ' ';
  begin perform public.set_integration_secret('test_provider', ''); r := r || 'empty-secret:ALLOWED(BAD) ';
  exception when others then r := r || 'empty-secret:rejected '; end;
  -- Task claiming
  insert into public.scheduled_tasks (kind, run_at) values ('send_sms', now() - interval '1 minute'), ('send_sms', now()), ('send_sms', now() + interval '1 hour');
  select count(*) into n from public.claim_scheduled_tasks(10); r := r || '| claim1=' || n;
  select count(*) into n from public.claim_scheduled_tasks(10); r := r || ' claim2=' || n;
  update public.scheduled_tasks set locked_until = now() - interval '1 second' where status = 'running' and kind = 'send_sms'
    and id = (select id from public.scheduled_tasks where status = 'running' order by run_at limit 1);
  select count(*) into n from public.claim_scheduled_tasks(10); r := r || ' reclaim-expired-lock=' || n;
  select max(attempts) into n from public.scheduled_tasks; r := r || ' max-attempts=' || n;
  -- Sync queue dedupe
  insert into public.sync_queue (provider, direction, entity_type, entity_id, operation) values ('ghl', 'outbound', 'contact', owner, 'upsert');
  begin insert into public.sync_queue (provider, direction, entity_type, entity_id, operation) values ('ghl', 'outbound', 'contact', owner, 'upsert');
    r := r || ' dup-pending-sync:ALLOWED(BAD)';
  exception when unique_violation then r := r || ' dup-pending-sync:rejected'; end;
  select count(*) into n from public.claim_sync_queue(10); r := r || ' sync-claim=' || n;
  insert into public.sync_queue (provider, direction, entity_type, entity_id, operation) values ('ghl', 'outbound', 'contact', owner, 'upsert');
  r := r || ' requeue-while-running:ok ';
  insert into public.webhook_events (provider, event_id, payload_hash) values ('stripe', 'evt_1', repeat('a', 64));
  execute 'reset role';

  -- Automations and opt-outs
  insert into public.automations (name, trigger_event) values ('Review request', 'job.completed') returning id into au;
  insert into public.automation_runs (automation_id, dedupe_key) values (au, 'job:1:completed');
  begin insert into public.automation_runs (automation_id, dedupe_key) values (au, 'job:1:completed'); r := r || '| dup-run:ALLOWED(BAD)';
  exception when unique_violation then r := r || '| dup-run:rejected'; end;
  begin insert into public.opt_outs (channel, value) values ('sms', '7185550101'); r := r || ' bad-phone-optout:ALLOWED(BAD)';
  exception when check_violation then r := r || ' bad-phone-optout:rejected'; end;

  -- As owner (admin)
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.integration_settings; r := r || ' | admin sees settings=' || n;
  update public.integration_settings set config = '{"location_id":"abc"}', is_enabled = true where provider = 'test_provider';
  get diagnostics n = row_count; r := r || ' admin-config-update rows=' || n;
  begin update public.integration_settings set vault_secret_id = gen_random_uuid() where provider = 'test_provider'; r := r || ' admin-repoint-secret:ALLOWED(BAD)';
  exception when insufficient_privilege then r := r || ' admin-repoint-secret:rejected'; end;
  begin perform public.get_integration_secret('test_provider'); r := r || ' admin-read-token:ALLOWED(BAD)';
  exception when insufficient_privilege then r := r || ' admin-read-token:rejected'; end;
  begin perform public.claim_scheduled_tasks(1); r := r || ' admin-claim-tasks:ALLOWED(BAD)';
  exception when insufficient_privilege then r := r || ' admin-claim-tasks:rejected'; end;
  select count(*) into n from public.webhook_events; r := r || ' admin sees webhook_events=' || n;
  insert into public.opt_outs (channel, value, source) values ('sms', '+17185550101', 'stop_keyword');
  r := r || ' optout:ok';
  execute 'reset role';

  -- As staff
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.integration_settings; r := r || ' | staff sees settings=' || n;
  select count(*) into n from public.webhook_events; r := r || ' webhook_events=' || n;
  select count(*) into n from public.opt_outs; r := r || ' opt_outs=' || n;
  begin insert into public.automations (name, trigger_event) values ('x', 'a.b'); r := r || ' staff-create-automation:ALLOWED(BAD)';
  exception when insufficient_privilege then r := r || ' staff-create-automation:rejected'; end;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
