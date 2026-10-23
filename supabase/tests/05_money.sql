do $$
declare
  owner uuid := gen_random_uuid(); staff uuid := gen_random_uuid();
  s1 uuid; s2 uuid; c uuid; p uuid; sv uuid; j1 uuid; j2 uuid; a1 uuid; a2 uuid; b1 uuid;
  inv uuid; inv2 uuid; po uuid; po2 uuid;
  r text := ''; n int; v bigint; v2 bigint;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'o@test.invalid', 'authenticated', 'authenticated'), (staff, 's@test.invalid', 'authenticated', 'authenticated');
  insert into public.profiles (user_id, role, full_name) values (owner, 'owner', 'O'), (staff, 'staff', 'S');
  insert into public.subcontractors (display_name, pay_rate_bps) values ('Ana', 4000) returning id into s1;
  insert into public.subcontractors (display_name, pay_type, pay_rate_cents) values ('Luis', 'flat', 7500) returning id into s2;
  insert into public.contacts (first_name) values ('Maria') returning id into c;
  insert into public.properties (contact_id, address_line1, zip, borough) values (c, '1 Main St', '11215', 'brooklyn') returning id into p;
  insert into public.services (name, base_price_cents, default_duration_minutes) values ('Standard clean', 18000, 180) returning id into sv;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, now() - interval '1 day', now() - interval '21 hours', 20000, 'completed', now()) returning id into j1;
  insert into public.jobs (contact_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, status, completed_at)
    values (c, p, sv, now() - interval '2 days', now() - interval '45 hours', 30000, 'completed', now()) returning id into j2;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, s1) returning id into a1;
  insert into public.job_assignments (job_id, subcontractor_id) values (j2, s1) returning id into a2;
  insert into public.job_assignments (job_id, subcontractor_id) values (j1, s2) returning id into b1;

  -- As staff: invoices
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.invoices (contact_id, issued_on, due_on) values (c, current_date, current_date + 15) returning id into inv;
  insert into public.invoice_line_items (invoice_id, job_id, description, unit_price_cents) values (inv, j1, 'Standard clean', 20000);
  insert into public.invoice_line_items (invoice_id, description, quantity, unit_price_cents) values (inv, 'Inside oven', 1, 4000);
  select subtotal_cents, total_cents into v, v2 from public.invoices where id = inv;
  r := r || 'invoice subtotal=' || v || ' total(tax 0)=' || v2 || ' ';
  update public.invoices set tax_cents = 213 where id = inv;
  select total_cents into v from public.invoices where id = inv; r := r || 'with tax=' || v || ' ';
  insert into public.invoices (contact_id) values (c) returning id into inv2;
  begin insert into public.invoice_line_items (invoice_id, job_id, description, unit_price_cents) values (inv2, j1, 'Again', 20000);
    r := r || 'bill-job-twice:ALLOWED(BAD) ';
  exception when unique_violation then r := r || 'bill-job-twice:rejected '; end;
  begin insert into public.payments (invoice_id, amount_cents, status) values (inv, 1000, 'succeeded'); r := r || 'staff-record-payment:ALLOWED(BAD) ';
  exception when insufficient_privilege then r := r || 'staff-record-payment:rejected '; end;
  select count(*) into n from public.payouts; r := r || 'staff sees payouts=' || n || ' ';
  execute 'reset role';

  -- Payments (service role path, as the Stripe webhook would write)
  insert into public.payments (invoice_id, amount_cents, status, stripe_payment_intent_id) values (inv, 10000, 'pending', 'pi_test_1');
  select amount_paid_cents into v from public.invoices where id = inv; r := r || '| pending-paid=' || v;
  update public.payments set status = 'succeeded', received_at = now() where stripe_payment_intent_id = 'pi_test_1';
  select amount_paid_cents into v from public.invoices where id = inv; r := r || ' succeeded-paid=' || v;
  begin insert into public.payments (invoice_id, amount_cents, status, stripe_payment_intent_id) values (inv, 10000, 'succeeded', 'pi_test_1');
    r := r || ' duplicate-stripe-intent:ALLOWED(BAD)';
  exception when unique_violation then r := r || ' duplicate-stripe-intent:rejected'; end;
  update public.payments set status = 'refunded', refunded_at = now() where stripe_payment_intent_id = 'pi_test_1';
  select amount_paid_cents into v from public.invoices where id = inv; r := r || ' refunded-paid=' || v || ' ';

  -- As owner: payouts
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, current_date - 7, current_date) returning id into po;
  insert into public.payout_items (payout_id, job_assignment_id, amount_cents) select po, id, pay_cents from public.job_assignments where id in (a1, a2);
  select total_cents into v from public.payouts where id = po; r := r || '| payout total(40% of $200+$300)=' || v;
  begin insert into public.payout_items (payout_id, job_assignment_id, amount_cents) values (po, b1, 7500);
    r := r || ' other-subs-assignment:ALLOWED(BAD)';
  exception when others then r := r || ' other-subs-assignment:rejected'; end;
  insert into public.payouts (subcontractor_id, period_start, period_end) values (s1, current_date - 14, current_date - 8) returning id into po2;
  begin insert into public.payout_items (payout_id, job_assignment_id, amount_cents) values (po2, a1, 8000);
    r := r || ' pay-assignment-twice:ALLOWED(BAD)';
  exception when unique_violation then r := r || ' pay-assignment-twice:rejected'; end;
  update public.payouts set status = 'approved', approved_at = now(), approved_by = owner where id = po;
  begin delete from public.payout_items where payout_id = po; r := r || ' remove-item-after-approve:ALLOWED(BAD)';
  exception when others then r := r || ' remove-item-after-approve:rejected'; end;
  execute 'reset role';

  -- As staff: can't change frozen pay, directly or through the job price
  perform set_config('request.jwt.claims', json_build_object('sub', staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.job_assignments set pay_override_cents = 1 where id = a1; r := r || ' | change-frozen-pay:ALLOWED(BAD)';
  exception when others then r := r || ' | change-frozen-pay:rejected'; end;
  begin update public.jobs set price_cents = 99900 where id = j1; r := r || ' reprice-paid-job:ALLOWED(BAD)';
  exception when others then r := r || ' reprice-paid-job:rejected'; end;
  update public.job_assignments set pay_override_cents = 8000 where id = b1; get diagnostics n = row_count;
  r := r || ' change-unpaid-pay rows=' || n;
  execute 'reset role';
  raise exception 'RESULTS: %', r;
end $$;
