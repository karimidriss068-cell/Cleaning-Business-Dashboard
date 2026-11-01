do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  s1 uuid; s2 uuid; c uuid; p uuid; sv uuid;
  j1 uuid; j2 uuid; j3 uuid; j4 uuid; j5 uuid; a11 uuid; a21 uuid; a12 uuid; a14 uuid;
  inv1 uuid; inv2 uuid; inv3 uuid; inv4 uuid; inv5 uuid; pay1 uuid; pay1b uuid; pay2 uuid;
  po1 uuid; po2 uuid; po3 uuid;
  wk date := date_trunc('week', ((now() at time zone 'America/New_York')::date - 7)::timestamp)::date;
  done_at timestamptz;
  r text := ''; n int; v text; b bigint; b2 bigint; t timestamptz; js jsonb; code text; doc uuid;
begin
  done_at := ((wk + 1) + time '12:00') at time zone 'America/New_York';
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated'),
    (u1, 'u1@test.invalid', 'authenticated', 'authenticated'), (u2, 'u2@test.invalid', 'authenticated', 'authenticated');
  insert into public.subcontractors (display_name, pay_rate_bps, status) values ('Ana Ruiz', 4000, 'active') returning id into s1;
  insert into public.subcontractors (display_name, pay_type, pay_rate_cents, status) values ('Luis Fernandez', 'flat', 7500, 'active') returning id into s2;
  insert into public.profiles (user_id, role, full_name, subcontractor_id) values
    (owner, 'owner', 'O', null), (staff, 'staff', 'S', null), (u1, 'subcontractor', 'Ana', s1), (u2, 'subcontractor', 'Luis', s2);
  insert into public.contacts (first_name, last_name, phone, email) values ('Maria', 'Lopez', '+17185550101', 'maria@example.com') returning id into c;
  insert into public.properties (contact_id, address_line1, zip, borough) values (c, '1 Main St', '11215', 'brooklyn') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Test standard clean', 20000, 180) returning id into sv;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, done_at - interval '3 hours', done_at, 20000, 'completed', done_at) returning id into j1;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, done_at - interval '3 hours', done_at, 30000, 'completed', done_at) returning id into j2;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents)
    values (c, p, sv, now() + interval '2 days', now() + interval '2 days 3 hours', 20000) returning id into j3;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, done_at - interval '3 hours', done_at, 10000, 'completed', done_at) returning id into j4;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, done_at - interval '3 hours', done_at, 5000, 'completed', done_at) returning id into j5;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, s1) returning id into a11;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, s2) returning id into a21;
  insert into public.job_assignments (job_id, subcontractor_id) values (j2, s1) returning id into a12;
  insert into public.job_assignments (job_id, subcontractor_id) values (j4, s1) returning id into a14;

  ----------------------------------------------------------------------- staff: read-only on invoices
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.create_invoice_from_job(j1); r := r || 'staff-create-invoice:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-create-invoice:rejected '; end;
  begin insert into public.invoices (contact_id) values (c); r := r || 'staff-direct-insert:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-direct-insert:rejected '; end;
  begin perform public.payout_candidates(wk); r := r || 'staff-payout-candidates:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-payout-candidates:rejected '; end;
  begin perform public.update_business_settings(88750, false, 14, 200000, 8000); r := r || 'staff-settings:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'staff-settings:rejected '; end;
  select count(*) into n from public.payouts; r := r || 'staff-sees-payouts=' || n || ' ';
  select count(*) into n from public.business_settings; r := r || 'staff-reads-settings=' || n || ' ';
  execute 'reset role';

  ----------------------------------------------------------------------- owner: invoices
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.update_business_settings(88750, false, 14, 200000, 8000);
  inv1 := public.create_invoice_from_job(j1);
  begin perform public.create_invoice_from_job(j1); r := r || 'invoice-job-twice:ALLOWED(BAD) ';
  exception when sqlstate 'KC010' then r := r || 'invoice-job-twice:rejected '; end;
  begin perform public.create_invoice_from_job(j3); r := r || 'invoice-unfinished-visit:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'invoice-unfinished-visit:rejected '; end;
  select (select count(*) from public.invoice_line_items where invoice_id = inv1) || '/' || total_cents || '/tax' || tax_cents || '/rate' || tax_rate_ppm into v from public.invoices where id = inv1;
  r := r || 'from-job=' || v || ' ';
  select updated_at into t from public.invoices where id = inv1;
  begin perform public.save_invoice(inv1, t - interval '1 second', '[{"description":"x","quantity":1,"unit_price_cents":100,"taxable":false}]', 0, 0, null, null);
    r := r || 'stale-save:ALLOWED(BAD) ';
  exception when sqlstate 'KC001' then r := r || 'stale-save:rejected '; end;
  begin perform public.save_invoice(inv1, t, '[{"description":"x","quantity":1,"unit_price_cents":-5,"taxable":false}]', 0, 0, null, null);
    r := r || 'negative-line:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'negative-line:rejected '; end;
  begin perform public.save_invoice(inv1, t, ('[{"description":"Sneaky","quantity":1,"unit_price_cents":100,"taxable":false,"job_id":"' || j2 || '"}]')::jsonb, 0, 0, null, null);
    r := r || 'attach-foreign-visit:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'attach-foreign-visit:rejected '; end;
  -- 20000 taxable at 8.875% = 1775; the oven line is not taxed. Deposit 5000.
  t := public.save_invoice(inv1, t, ('[{"description":"Standard clean","quantity":1,"unit_price_cents":20000,"taxable":true,"job_id":"' || j1 || '"},'
    '{"description":"Inside oven","quantity":1,"unit_price_cents":4000,"taxable":false}]')::jsonb, 0, 5000, (now() at time zone 'America/New_York')::date + 14, 'Thanks!');
  select subtotal_cents || '/' || tax_cents || '/' || total_cents || '/dep' || deposit_cents into v from public.invoices where id = inv1; r := r || 'saved=' || v || ' ';
  t := public.save_invoice(inv1, t, ('[{"description":"Standard clean","quantity":1,"unit_price_cents":20000,"taxable":true,"job_id":"' || j1 || '"},'
    '{"description":"Inside oven","quantity":1,"unit_price_cents":4000,"taxable":false}]')::jsonb, 1000, 5000, (now() at time zone 'America/New_York')::date + 14, 'Thanks!');
  select tax_cents || '/' || total_cents into v from public.invoices where id = inv1; r := r || 'with-discount(tax/total)=' || v || ' ';
  begin perform public.save_invoice(inv1, t, '[{"description":"x","quantity":1,"unit_price_cents":100,"taxable":false}]', 500, 0, null, null);
    r := r || 'discount-over-subtotal:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'discount-over-subtotal:rejected '; end;
  t := public.save_invoice(inv1, t, ('[{"description":"Standard clean","quantity":1,"unit_price_cents":20000,"taxable":true,"job_id":"' || j1 || '"},'
    '{"description":"Inside oven","quantity":1,"unit_price_cents":4000,"taxable":false}]')::jsonb, 0, 5000, (now() at time zone 'America/New_York')::date + 14, 'Thanks!');
  t := public.send_invoice(inv1, t);
  select status || '/issued' || (issued_on is not null) into v from public.invoices where id = inv1; r := r || 'sent=' || v || ' ';
  begin perform public.send_invoice(inv1, t); r := r || 'send-twice:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'send-twice:rejected '; end;
  begin perform public.save_invoice(inv1, t, '[{"description":"x","quantity":1,"unit_price_cents":100,"taxable":false}]', 0, 0, null, null);
    r := r || 'edit-sent:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'edit-sent:rejected '; end;
  begin perform public.delete_invoice_draft(inv1); r := r || 'delete-sent:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'delete-sent:rejected '; end;

  -- payments
  begin perform public.record_manual_payment(inv1, 5000, 'zelle', '', null, gen_random_uuid()); r := r || 'zelle-no-reference:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'zelle-no-reference:rejected '; end;
  begin perform public.record_manual_payment(inv1, 99999999, 'cash', null, null, gen_random_uuid()); r := r || 'overpay:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'overpay:rejected '; end;
  begin perform public.record_manual_payment(inv1, 5000, 'card', null, null, gen_random_uuid()); r := r || 'manual-card:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'manual-card:rejected '; end;
  pay1 := public.record_manual_payment(inv1, 5000, 'zelle', 'ZEL-1', null, '00000000-0000-4000-8000-000000000001');
  pay1b := public.record_manual_payment(inv1, 5000, 'zelle', 'ZEL-1', null, '00000000-0000-4000-8000-000000000001');
  select status || '/paid' || amount_paid_cents into v from public.invoices where id = inv1;
  r := r || 'deposit=' || v || ' retry-same-request=' || (pay1 = pay1b) || ' ';
  select count(*) into n from public.payments where invoice_id = inv1; r := r || 'payments=' || n || ' ';

  -- payouts: a partly paid invoice can't release pay
  select string_agg(distinct coalesce(reason_code, 'ELIGIBLE'), ',' order by coalesce(reason_code, 'ELIGIBLE')) into v
  from public.payout_candidates(wk) where job_id = j1;
  r := r || 'j1-partial=' || v || ' ';
  select string_agg(distinct coalesce(reason_code, 'ELIGIBLE'), ',') into v from public.payout_candidates(wk) where job_id = j2; r := r || 'j2-no-invoice=' || v || ' ';
  js := public.build_payout_drafts(wk);
  select count(*) into n from public.payouts where period_start = wk and status <> 'void'; r := r || 'built-while-unpaid=' || n || ' ';

  perform public.record_manual_payment(inv1, 20775, 'cash', null, null, gen_random_uuid());
  select status || '/paid' || amount_paid_cents || '/paid_at' || (paid_at is not null) into v from public.invoices where id = inv1; r := r || 'balance-paid=' || v || ' ';
  begin perform public.record_manual_payment(inv1, 100, 'cash', null, null, gen_random_uuid()); r := r || 'pay-paid-invoice:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'pay-paid-invoice:rejected '; end;

  inv2 := public.create_invoice_from_job(j2);
  select updated_at into t from public.invoices where id = inv2;
  perform public.send_invoice(inv2, t);
  inv4 := public.create_invoice_from_job(j4);      -- stays a draft for now
  select string_agg(distinct coalesce(reason_code, 'ELIGIBLE'), ',') into v from public.payout_candidates(wk) where job_id = j2; r := r || 'j2-unpaid=' || v || ' ';
  select string_agg(distinct coalesce(reason_code, 'ELIGIBLE'), ',') into v from public.payout_candidates(wk) where job_id = j4; r := r || 'j4-draft-invoice=' || v || ' ';
  begin perform public.mark_invoice_collected(inv2, ''); r := r || 'collected-no-note:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'collected-no-note:rejected '; end;
  perform public.mark_invoice_collected(inv2, 'Cash handed over at the door');
  select string_agg(distinct coalesce(reason_code, 'ELIGIBLE'), ',') into v from public.payout_candidates(wk) where job_id = j2; r := r || 'j2-collected=' || v || ' ';

  js := public.build_payout_drafts(wk);
  select id, total_cents into po1, b from public.payouts where subcontractor_id = s1 and period_start = wk and status = 'draft';
  select id into po2 from public.payouts where subcontractor_id = s2 and period_start = wk and status = 'draft';
  select count(*) into n from public.payout_items where payout_id = po1;
  r := r || '| built ' || (js ->> 'built') || ' ana=' || b || '(' || n || ' visits) luis=' || (select total_cents from public.payouts where id = po2) || ' ';
  select string_agg(distinct coalesce(reason_code, 'ELIGIBLE'), ',') into v from public.payout_candidates(wk, s1) where job_id = j4; r := r || 'j4-excluded=' || v || ' ';
  js := public.build_payout_drafts(wk);
  select count(*) into n from public.payouts where period_start = wk and status <> 'void'; r := r || 'rebuild-idempotent(payouts)=' || n || ' ';
  begin perform public.build_payout_drafts(wk + 1); r := r || 'non-monday-week:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'non-monday-week:rejected '; end;
  begin perform public.build_payout_drafts(((now() at time zone 'America/New_York')::date + 14)); r := r || 'future-week:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'future-week:rejected '; end;

  -- approve Ana's payout, then it is frozen
  select updated_at into t from public.payouts where id = po1;
  begin perform public.approve_payout(po1, t - interval '1 second'); r := r || 'approve-stale:ALLOWED(BAD) ';
  exception when sqlstate 'KC001' then r := r || 'approve-stale:rejected '; end;
  perform public.approve_payout(po1, t);
  select status || '/by-owner' || (approved_by = owner) into v from public.payouts where id = po1; r := r || 'approved=' || v || ' ';
  execute 'reset role';
  begin delete from public.payout_items where payout_id = po1; r := r || 'remove-item-after-approve:ALLOWED(BAD) ';
  exception when others then r := r || 'remove-item-after-approve:rejected '; end;
  begin update public.job_assignments set pay_override_cents = 1 where id = a11; r := r || 'change-approved-pay:ALLOWED(BAD) ';
  exception when others then r := r || 'change-approved-pay:rejected '; end;
  begin insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, wk - 7, wk - 1) returning id into po3;
    insert into public.payout_items (payout_id, job_assignment_id, amount_cents) values (po3, a11, 8000);
    r := r || 'double-pay:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'double-pay:rejected '; end;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Ana's j4 invoice gets paid after her week was approved: this week is locked, so it carries to the next week.
  select updated_at into t from public.invoices where id = inv4;
  perform public.send_invoice(inv4, t);
  perform public.record_manual_payment(inv4, 10000, 'cash', null, null, gen_random_uuid());
  js := public.build_payout_drafts(wk);
  r := r || 'late-paid-visit-this-week(skipped)=' || (js ->> 'skipped') || ' ';
  js := public.build_payout_drafts(wk + 7);
  select total_cents into b from public.payouts where subcontractor_id = s1 and period_start = wk + 7 and status = 'draft';
  r := r || 'carried-to-next-week=' || coalesce(b::text, 'none') || ' ';
  begin perform public.mark_payout_paid(po1, 'zelle', '', null); r := r || 'paid-no-reference:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'paid-no-reference:rejected '; end;
  begin perform public.mark_payout_paid(po2, 'zelle', 'Z-9', null); r := r || 'pay-unapproved:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'pay-unapproved:rejected '; end;
  perform public.mark_payout_paid(po1, 'zelle', 'ZELLE-CONF-77', null);
  select status || '/' || paid_method || '/' || paid_reference || '/at' || (paid_at is not null) into v from public.payouts where id = po1; r := r || 'paid=' || v || ' ';
  begin perform public.mark_payout_paid(po1, 'zelle', 'AGAIN', null); r := r || 'pay-twice:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'pay-twice:rejected '; end;
  begin perform public.reopen_payout(po1); r := r || 'reopen-paid:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'reopen-paid:rejected '; end;
  begin perform public.clear_invoice_collected(inv2); r := r || 'unmark-collected-after-approval:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'unmark-collected-after-approval:rejected '; end;

  -- A refund after the payout was built: Luis's still-draft payout can no longer be approved
  select updated_at into t from public.payouts where id = po2;
  perform public.approve_payout(po2, t);
  perform public.reopen_payout(po2);
  select id into pay2 from public.payments where invoice_id = inv1 and method = 'cash';
  begin perform public.record_refund(pay2, 99999999, 'x', null); r := r || 'refund-too-much:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'refund-too-much:rejected '; end;
  perform public.record_refund(pay2, 4000, 'Partial refund', gen_random_uuid());
  select status || '/paid' || amount_paid_cents into v from public.invoices where id = inv1; r := r || 'after-refund=' || v || ' ';
  select updated_at into t from public.payouts where id = po2;
  begin perform public.approve_payout(po2, t); r := r || 'approve-after-refund:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'approve-after-refund:rejected(luis keeps draft) '; end;
  begin perform public.void_invoice(inv1, 'oops'); r := r || 'void-with-payments:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'void-with-payments:rejected '; end;
  inv5 := public.create_invoice_from_job(j5);
  perform public.void_invoice(inv5, 'Created by mistake');
  select status into v from public.invoices where id = inv5; r := r || 'void-draft=' || v || ' ';
  inv3 := public.create_invoice_from_job(j5);
  r := r || 'reinvoice-after-void=' || (inv3 is not null) || ' ';
  begin perform public.void_invoice(inv5, 'again'); r := r || 'void-twice:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'void-twice:rejected '; end;
  begin insert into public.invoice_line_items (invoice_id, job_id, description, unit_price_cents) values (inv3, j1, 'x', 1); r := r || 'line-edit-as-owner:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'line-edit-as-owner:rejected '; end;
  execute 'reset role';

  ----------------------------------------------------------------------- Stripe (service role), overdue
  js := public.stripe_record_payment(inv2, 30000, 'pi_test_1', null, 'cs_test_1');
  r := r || '| stripe-first dup=' || (js ->> 'duplicate') || ' ';
  js := public.stripe_record_payment(inv2, 30000, 'pi_test_1', 'ch_test_1', 'cs_test_1');
  select count(*) into n from public.payments where stripe_payment_intent_id = 'pi_test_1';
  r := r || 'stripe-redelivered dup=' || (js ->> 'duplicate') || ' rows=' || n || ' ';
  select stripe_charge_id into v from public.payments where stripe_payment_intent_id = 'pi_test_1'; r := r || 'charge-filled=' || coalesce(v, 'null') || ' ';
  select status || '/paid' || amount_paid_cents into v from public.invoices where id = inv2; r := r || 'inv2=' || v || ' ';
  js := public.stripe_record_refund('pi_test_1', 're_test_1', 1000);
  js := public.stripe_record_refund('pi_test_1', 're_test_1', 1000);
  select count(*) into n from public.refunds where stripe_refund_id = 're_test_1'; r := r || 'refund-redelivered rows=' || n || ' ';
  begin perform public.stripe_record_refund('pi_unknown', 're_x', 100); r := r || 'refund-before-payment:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'refund-before-payment:rejected(retry) '; end;
  begin insert into public.payments (invoice_id, amount_cents, status, stripe_payment_intent_id) values (inv2, 100, 'succeeded', 'pi_test_1');
    r := r || 'dup-intent-insert:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'dup-intent-insert:rejected '; end;
  insert into public.webhook_events (provider, event_id, payload_hash) values ('stripe', 'evt_1', repeat('a', 64));
  begin insert into public.webhook_events (provider, event_id, payload_hash) values ('stripe', 'evt_1', repeat('a', 64));
    r := r || 'dup-webhook-event:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'dup-webhook-event:rejected '; end;

  select updated_at into t from public.invoices where id = inv3;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.send_invoice(inv3, t);
  execute 'reset role';
  alter table public.invoices disable trigger invoices_guard;
  update public.invoices set issued_on = (now() at time zone 'America/New_York')::date - 10, due_on = (now() at time zone 'America/New_York')::date - 3 where id = inv3;
  alter table public.invoices enable trigger invoices_guard;
  n := public.mark_overdue_invoices();
  select status into v from public.invoices where id = inv3; r := r || 'overdue-marked=' || n || '/' || v || ' ';
  n := public.mark_overdue_invoices(); r := r || 'overdue-again=' || n || ' ';
  perform public.stripe_record_payment(inv3, 5000, 'pi_test_2', 'ch_test_2', null);
  select status into v from public.invoices where id = inv3; r := r || 'overdue-then-paid=' || v || ' ';
  js := public.invoice_for_pay_token((select pay_token from public.invoices where id = inv3));
  r := r || 'pay-page-has-no-contact-info=' || (position('maria@' in js::text) = 0 and position('+1718' in js::text) = 0 and position('1 Main' in js::text) = 0) || ' ';
  r := r || 'void-invoice-pay-page-still-readable=' || (public.invoice_for_pay_token((select pay_token from public.invoices where id = inv5)) is not null) || ' ';
  perform public.stripe_save_card(c, null, 'cus_test_1', 'pm_test_1', 'visa', '4242', 12, 2030, null);
  perform public.stripe_save_card(c, null, 'cus_test_1', 'pm_test_1', 'visa', '4242', 12, 2030, null);
  select count(*) into n from public.payment_methods where contact_id = c; r := r || 'card-saved-once=' || n || ' ';

  ----------------------------------------------------------------------- owner: 1099, W-9, finance
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select paid_cents || '/w9' || (w9_received_at is not null) into v from public.contractor_1099_summary(extract(year from now() at time zone 'America/New_York')::int) where subcontractor_id = s1;
  r := r || '| 1099-ana=' || v || ' ';
  select paid_cents || '/pending' || approved_cents into v from public.contractor_1099_summary(extract(year from now() at time zone 'America/New_York')::int) where subcontractor_id = s2;
  r := r || '1099-luis=' || v || ' ';
  select paid_cents into b from public.contractor_1099_summary(extract(year from now() at time zone 'America/New_York')::int - 1) where subcontractor_id = s1; r := r || 'last-year-ana=' || b || ' ';
  execute 'reset role';
  insert into storage.objects (bucket_id, name) values ('subcontractor-documents', s1::text || '/w9.pdf');
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public.record_w9(s1, s2::text || '/w9.pdf'); r := r || 'w9-wrong-folder:ALLOWED(BAD) ';
  exception when sqlstate 'KC005' then r := r || 'w9-wrong-folder:rejected '; end;
  doc := public.record_w9(s1, s1::text || '/w9.pdf');
  select (w9_received_at is not null)::text into v from public.subcontractors where id = s1; r := r || 'w9-on-file=' || v || ' ';
  select count(*) into n from storage.objects where bucket_id = 'subcontractor-documents'; r := r || 'owner-reads-w9-file=' || n || ' ';
  select month_start || ':' || revenue_cents || '/' || collected_cents || '/' || outstanding_cents || '/' || coalesce(payouts_cents::text, 'null') || '/' || coalesce(margin_cents::text, 'null') into v
  from public.finance_summary(1); r := r || 'finance-owner=' || v || ' ';
  select count(*) into n from public.finance_log; r := r || 'log-rows>0=' || (n > 0) || ' ';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from storage.objects where bucket_id = 'subcontractor-documents'; r := r || 'staff-reads-w9-file=' || n || ' ';
  select coalesce(payouts_cents::text, 'null') || '/' || coalesce(margin_cents::text, 'null') into v from public.finance_summary(1); r := r || 'finance-staff(payouts/margin)=' || v || ' ';
  select count(*) into n from public.invoices; r := r || 'staff-sees-invoices=' || (n > 0) || ' ';
  select count(*) into n from public.finance_log where entity in ('payout', 'document', 'settings'); r := r || 'staff-sees-payout-log=' || n || ' ';
  select count(*) into n from public.card_requests; r := r || 'staff-sees-card-links=' || n || ' ';
  execute 'reset role';

  ----------------------------------------------------------------------- cleaners
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := 0;
  select count(*) into n from public.invoices; r := r || '| cleaner-invoices=' || n;
  select count(*) into n from public.invoice_line_items; r := r || ' lines=' || n;
  select count(*) into n from public.payments; r := r || ' payments=' || n;
  select count(*) into n from public.refunds; r := r || ' refunds=' || n;
  select count(*) into n from public.payouts; r := r || ' payouts=' || n;
  select count(*) into n from public.payout_items; r := r || ' items=' || n;
  select count(*) into n from public.payment_methods; r := r || ' cards=' || n;
  select count(*) into n from public.card_requests; r := r || ' links=' || n;
  select count(*) into n from public.business_settings; r := r || ' settings=' || n;
  select count(*) into n from public.finance_log; r := r || ' log=' || n;
  select count(*) into n from public.subcontractor_documents; r := r || ' docs=' || n;
  select count(*) into n from storage.objects where bucket_id = 'subcontractor-documents'; r := r || ' w9-files=' || n || ' ';
  begin perform public.finance_summary(1); r := r || 'cleaner-finance:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-finance:rejected '; end;
  begin perform public.contractor_1099_summary(2026); r := r || 'cleaner-1099:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-1099:rejected '; end;
  begin perform public.create_invoice_from_job(j1); r := r || 'cleaner-create-invoice:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-create-invoice:rejected '; end;
  begin perform public.mark_payout_paid(po2, 'zelle', 'x', null); r := r || 'cleaner-mark-paid:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-mark-paid:rejected '; end;
  begin perform public.mark_invoice_collected(inv2, 'x'); r := r || 'cleaner-collect:ALLOWED(BAD) ';
  exception when sqlstate 'KC004' then r := r || 'cleaner-collect:rejected '; end;
  begin perform public.stripe_record_payment(inv2, 100, 'pi_x', null, null); r := r || 'cleaner-stripe-fn:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'cleaner-stripe-fn:rejected '; end;
  js := public.crew_payouts();
  r := r || 'ana-pay-rows=' || jsonb_array_length(js -> 'payouts') || '/ytd' || (js ->> 'ytd_paid_cents') || '/first-total' || (js -> 'payouts' -> 0 ->> 'total_cents') || ' ';
  r := r || 'ana-sees-no-client-or-invoice=' || (position('Maria' in js::text) = 0 and position('invoice' in js::text) = 0 and position('Luis' in js::text) = 0 and position('Lopez' in js::text) = 0) || ' ';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  js := public.crew_payouts();
  r := r || 'luis-pay-rows(draft hidden)=' || jsonb_array_length(js -> 'payouts') || '/ytd' || (js ->> 'ytd_paid_cents') || ' ';
  r := r || 'luis-sees-no-ana=' || (position('Ana' in js::text) = 0 and position('20000' in js::text) = 0) || ' ';
  execute 'reset role';

  raise exception 'RESULTS: %', r;
end $$;
