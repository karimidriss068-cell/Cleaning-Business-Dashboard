-- Growth goal: $10k/month plan, ad spend tracking, capacity, cash and the
-- "can I scale spend?" light.
--
--   * The plan and its assumptions live in growth_settings (one row, read-only
--     to signed-in users). The monthly milestones are rows in the existing
--     goals table (metric revenue_cents, period month), kept in step with the
--     plan by save_growth_plan. Staff read; only owner/admin change anything,
--     through functions that validate, run in one transaction and log.
--   * Daily ad spend reuses marketing_campaigns / marketing_daily_stats; nothing
--     here calls an ad API. A lead whose source maps to a platform is attached
--     to that platform's newest active campaign when it has none.
--   * growth_core() gathers the raw numbers (New York months and days). The
--     pace, ad, capacity, cash and scale-light rules live in src/lib/growth.ts
--     (unit-tested) so there is one copy of them. Cash is null for staff, who
--     have no access to payouts.
-- Errors (SQLSTATE): KC004 not allowed, KC005 bad input, KC001 not found.

alter table public.finance_log drop constraint finance_log_entity_check;
alter table public.finance_log add constraint finance_log_entity_check
  check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings', 'growth'));

create table public.growth_settings (
  id boolean primary key default true check (id),
  -- Plan month 1 is the New York month containing the start date.
  start_date date not null default ((date_trunc('month', now() at time zone 'America/New_York') + interval '1 month')::date),
  residential_target_cents bigint not null default 640000 check (residential_target_cents >= 0),
  commercial_target_cents bigint not null default 360000 check (commercial_target_cents >= 0),
  -- Assumptions
  res_visit_price_cents bigint not null default 18000 check (res_visit_price_cents > 0),
  res_visits_per_month integer not null default 2 check (res_visits_per_month between 1 and 31),
  comm_account_value_cents bigint not null default 60000 check (comm_account_value_cents > 0),
  close_rate_bps integer not null default 2000 check (close_rate_bps between 1 and 10000),
  cac_cents bigint not null default 25000 check (cac_cents >= 0),
  margin_bps integer not null default 4000 check (margin_bps between 1 and 10000),
  monthly_ad_budget_cents bigint not null default 100000 check (monthly_ad_budget_cents >= 0),
  reply_target_minutes integer not null default 5 check (reply_target_minutes between 1 and 1440),
  -- No availability fields exist for cleaners yet, so capacity is active
  -- cleaners times this editable number.
  cleans_per_cleaner_per_week integer not null default 12 check (cleans_per_cleaner_per_week between 1 and 60),
  -- Cash. Counted from cash_start_date; fixed costs are charged for each full
  -- month that has passed since then.
  starting_capital_cents bigint not null default 500000 check (starting_capital_cents >= 0),
  cash_start_date date not null default ((now() at time zone 'America/New_York')::date),
  monthly_fixed_costs_cents bigint not null default 150000 check (monthly_fixed_costs_cents >= 0),
  min_buffer_cents bigint not null default 100000 check (min_buffer_cents >= 0),
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.growth_settings default values;
create index growth_settings_updated_by_idx on public.growth_settings (updated_by);
create trigger growth_settings_set_updated_at before update on public.growth_settings
  for each row execute function private.set_updated_at();

alter table public.growth_settings enable row level security;
revoke all on public.growth_settings from anon;
revoke insert, update, delete on public.growth_settings from authenticated;
create policy "growth_settings: staff read" on public.growth_settings for select to authenticated using ((select private.is_staff()));

-- Default milestones: $1k, $2.5k, $4k, $6k, $8k, $10k, one per plan month.
insert into public.goals (metric, period, period_start, period_end, target_value, notes)
select 'revenue_cents', 'month', m::date, (m + interval '1 month' - interval '1 day')::date, t.cents, 'Growth plan milestone'
from public.growth_settings s
cross join lateral generate_series(date_trunc('month', s.start_date), date_trunc('month', s.start_date) + interval '5 months', interval '1 month') with ordinality as g(m, n)
join (values (1, 100000), (2, 250000), (3, 400000), (4, 600000), (5, 800000), (6, 1000000)) as t(n, cents) on t.n = g.n
on conflict (metric, period, period_start) do nothing;

-- ---------------------------------------------------------------------------
-- Lead -> campaign: the lead's source decides the platform.
-- ---------------------------------------------------------------------------

create function private.attribute_lead_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform public.marketing_platform;
begin
  if new.campaign_id is not null or new.source is null then
    return new;
  end if;
  v_platform := (case new.source when 'instagram' then 'meta' when 'google' then 'google' when 'thumbtack' then 'thumbtack' end)::public.marketing_platform;
  if v_platform is null then
    return new;
  end if;
  select c.id into new.campaign_id
  from public.marketing_campaigns c
  where c.platform = v_platform and c.status = 'active'
  order by c.start_date desc nulls last, c.created_at desc
  limit 1;
  return new;
end;
$$;
revoke execute on function private.attribute_lead_campaign() from public, anon, authenticated;
create trigger leads_attribute_campaign before insert or update of source on public.leads
  for each row execute function private.attribute_lead_campaign();

-- ---------------------------------------------------------------------------
-- Writes (owner/admin only)
-- ---------------------------------------------------------------------------

create function private.save_growth_plan(
  p_start_date date, p_residential_cents bigint, p_commercial_cents bigint, p_milestones bigint[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.growth_settings%rowtype;
  v_first date := date_trunc('month', p_start_date)::date;
  i integer;
begin
  perform private.require_admin();
  if p_start_date is null or p_start_date not between date '2024-01-01' and date '2100-01-01'
     or p_residential_cents < 0 or p_commercial_cents < 0 or p_residential_cents + p_commercial_cents = 0 then
    raise exception 'check the start date and the residential and commercial targets' using errcode = 'KC005';
  end if;
  if p_milestones is null or coalesce(array_length(p_milestones, 1), 0) <> 6 then
    raise exception 'there must be six monthly milestones' using errcode = 'KC005';
  end if;
  for i in 1..6 loop
    if p_milestones[i] is null or p_milestones[i] < 0 or (i > 1 and p_milestones[i] < p_milestones[i - 1]) then
      raise exception 'milestones must not go down from one month to the next' using errcode = 'KC005';
    end if;
  end loop;
  if p_milestones[6] <> p_residential_cents + p_commercial_cents then
    raise exception 'the last milestone must equal the monthly goal (residential plus commercial)' using errcode = 'KC005';
  end if;
  select * into v_old from public.growth_settings where id;
  update public.growth_settings
  set start_date = p_start_date, residential_target_cents = p_residential_cents,
      commercial_target_cents = p_commercial_cents, updated_by = (select auth.uid())
  where id;
  delete from public.goals where metric = 'revenue_cents' and period = 'month';
  for i in 1..6 loop
    insert into public.goals (metric, period, period_start, period_end, target_value, notes, created_by)
    values ('revenue_cents', 'month', (v_first + make_interval(months => i - 1))::date,
            (v_first + make_interval(months => i) - interval '1 day')::date, p_milestones[i], 'Growth plan milestone', (select auth.uid()));
  end loop;
  perform private.log_finance('growth', null, 'plan_saved', jsonb_build_object(
    'start_date', jsonb_build_array(v_old.start_date, p_start_date),
    'residential_target_cents', jsonb_build_array(v_old.residential_target_cents, p_residential_cents),
    'commercial_target_cents', jsonb_build_array(v_old.commercial_target_cents, p_commercial_cents),
    'milestones', to_jsonb(p_milestones)));
end;
$$;

create function private.save_growth_assumptions(
  p_visit_price_cents bigint, p_visits_per_month integer, p_account_value_cents bigint, p_close_rate_bps integer,
  p_cac_cents bigint, p_margin_bps integer, p_ad_budget_cents bigint, p_reply_target_minutes integer, p_cleans_per_cleaner integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.growth_settings%rowtype;
begin
  perform private.require_admin();
  if p_visit_price_cents <= 0 or p_visits_per_month not between 1 and 31 or p_account_value_cents <= 0
     or p_close_rate_bps not between 1 and 10000 or p_cac_cents < 0 or p_margin_bps not between 1 and 10000
     or p_ad_budget_cents < 0 or p_reply_target_minutes not between 1 and 1440 or p_cleans_per_cleaner not between 1 and 60 then
    raise exception 'one of the assumptions is out of range' using errcode = 'KC005';
  end if;
  select * into v_old from public.growth_settings where id;
  update public.growth_settings
  set res_visit_price_cents = p_visit_price_cents, res_visits_per_month = p_visits_per_month,
      comm_account_value_cents = p_account_value_cents, close_rate_bps = p_close_rate_bps, cac_cents = p_cac_cents,
      margin_bps = p_margin_bps, monthly_ad_budget_cents = p_ad_budget_cents, reply_target_minutes = p_reply_target_minutes,
      cleans_per_cleaner_per_week = p_cleans_per_cleaner, updated_by = (select auth.uid())
  where id;
  perform private.log_finance('growth', null, 'assumptions_saved', jsonb_build_object(
    'res_visit_price_cents', jsonb_build_array(v_old.res_visit_price_cents, p_visit_price_cents),
    'res_visits_per_month', jsonb_build_array(v_old.res_visits_per_month, p_visits_per_month),
    'comm_account_value_cents', jsonb_build_array(v_old.comm_account_value_cents, p_account_value_cents),
    'close_rate_bps', jsonb_build_array(v_old.close_rate_bps, p_close_rate_bps),
    'cac_cents', jsonb_build_array(v_old.cac_cents, p_cac_cents),
    'margin_bps', jsonb_build_array(v_old.margin_bps, p_margin_bps),
    'monthly_ad_budget_cents', jsonb_build_array(v_old.monthly_ad_budget_cents, p_ad_budget_cents),
    'reply_target_minutes', jsonb_build_array(v_old.reply_target_minutes, p_reply_target_minutes),
    'cleans_per_cleaner_per_week', jsonb_build_array(v_old.cleans_per_cleaner_per_week, p_cleans_per_cleaner)));
end;
$$;

create function private.save_cash_settings(
  p_starting_cents bigint, p_cash_start_date date, p_fixed_cents bigint, p_buffer_cents bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.growth_settings%rowtype;
begin
  perform private.require_admin();
  if p_starting_cents < 0 or p_fixed_cents < 0 or p_buffer_cents < 0
     or p_cash_start_date is null or p_cash_start_date not between date '2024-01-01' and date '2100-01-01' then
    raise exception 'check the cash settings' using errcode = 'KC005';
  end if;
  select * into v_old from public.growth_settings where id;
  update public.growth_settings
  set starting_capital_cents = p_starting_cents, cash_start_date = p_cash_start_date,
      monthly_fixed_costs_cents = p_fixed_cents, min_buffer_cents = p_buffer_cents, updated_by = (select auth.uid())
  where id;
  perform private.log_finance('growth', null, 'cash_saved', jsonb_build_object(
    'starting_capital_cents', jsonb_build_array(v_old.starting_capital_cents, p_starting_cents),
    'cash_start_date', jsonb_build_array(v_old.cash_start_date, p_cash_start_date),
    'monthly_fixed_costs_cents', jsonb_build_array(v_old.monthly_fixed_costs_cents, p_fixed_cents),
    'min_buffer_cents', jsonb_build_array(v_old.min_buffer_cents, p_buffer_cents)));
end;
$$;

create function private.create_ad_campaign(p_platform public.marketing_platform, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    raise exception 'give the campaign a name (up to 120 characters)' using errcode = 'KC005';
  end if;
  insert into public.marketing_campaigns (platform, name, status, start_date)
  values (p_platform, btrim(p_name), 'active', (now() at time zone 'America/New_York')::date)
  returning id into v_id;
  perform private.log_finance('growth', v_id, 'campaign_created', jsonb_build_object('platform', p_platform, 'name', btrim(p_name)));
  return v_id;
end;
$$;

-- One spend figure per campaign per day: entering a day again replaces it.
create function private.record_ad_spend(p_campaign_id uuid, p_date date, p_spend_cents bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_id uuid;
  v_old bigint;
begin
  perform private.require_admin();
  if p_date is null or p_date > v_today or p_date < v_today - 400 then
    raise exception 'the date must be within the last year and not in the future' using errcode = 'KC005';
  end if;
  if p_spend_cents is null or p_spend_cents < 0 or p_spend_cents > 100000000 then
    raise exception 'enter the spend in dollars, up to $1,000,000' using errcode = 'KC005';
  end if;
  if not exists (select 1 from public.marketing_campaigns where id = p_campaign_id) then
    raise exception 'that campaign no longer exists' using errcode = 'KC001';
  end if;
  select spend_cents into v_old from public.marketing_daily_stats where campaign_id = p_campaign_id and date = p_date;
  insert into public.marketing_daily_stats (campaign_id, date, spend_cents)
  values (p_campaign_id, p_date, p_spend_cents)
  on conflict (campaign_id, date) do update set spend_cents = excluded.spend_cents
  returning id into v_id;
  perform private.log_finance('growth', v_id, 'ad_spend_recorded', jsonb_build_object(
    'campaign_id', p_campaign_id, 'date', p_date, 'spend_cents', p_spend_cents, 'previous_cents', v_old));
  return v_id;
end;
$$;

create function private.delete_ad_spend(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.marketing_daily_stats%rowtype;
begin
  perform private.require_admin();
  delete from public.marketing_daily_stats where id = p_id returning * into v_row;
  if not found then
    raise exception 'that spend entry was already removed' using errcode = 'KC001';
  end if;
  perform private.log_finance('growth', p_id, 'ad_spend_deleted', jsonb_build_object(
    'campaign_id', v_row.campaign_id, 'date', v_row.date, 'spend_cents', v_row.spend_cents));
end;
$$;

-- ---------------------------------------------------------------------------
-- Raw numbers for the growth snapshot (New York days and months)
-- ---------------------------------------------------------------------------

-- Revenue earned in [p_from, p_to): invoiced (sent or later, before tax and
-- after discount) plus completed visits that are not on a sent invoice yet,
-- so work done counts before it is billed and never twice.
create function private.growth_revenue_cents(p_from date, p_to date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(i.subtotal_cents - i.discount_cents) from public.invoices i
                   where i.status not in ('draft', 'void') and i.issued_on >= p_from and i.issued_on < p_to), 0)
       + coalesce((select sum(j.price_cents) from public.jobs j
                   where j.status = 'completed'
                     and (j.completed_at at time zone 'America/New_York')::date >= p_from
                     and (j.completed_at at time zone 'America/New_York')::date < p_to
                     and not exists (select 1 from public.invoice_line_items l
                                     join public.invoices i on i.id = l.invoice_id
                                     where l.job_id = j.id and i.status not in ('draft', 'void'))), 0);
$$;
revoke execute on function private.growth_revenue_cents(date, date) from public, anon, authenticated;

create function private.growth_core(p_cash boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.growth_settings%rowtype;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_month date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
  v_next date := (date_trunc('month', (now() at time zone 'America/New_York')) + interval '1 month')::date;
  v_prev date := (date_trunc('month', (now() at time zone 'America/New_York')) - interval '1 month')::date;
  v_win date := v_today - 29;
  v_milestones jsonb;
  v_ads jsonb;
  v_cash jsonb := null;
  v_res_active integer;
  v_comm jsonb;
  v_reply jsonb;
  v_collected bigint; v_refunds bigint; v_payouts bigint; v_ad_since bigint; v_fixed_months integer;
begin
  select * into s from public.growth_settings where id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'monthStart', g.period_start, 'targetCents', g.target_value,
           'actualCents', private.growth_revenue_cents(g.period_start, (g.period_start + interval '1 month')::date)) order by g.period_start), '[]')
  into v_milestones
  from public.goals g where g.metric = 'revenue_cents' and g.period = 'month';

  select count(*) into v_res_active
  from public.contacts c
  where c.type = 'residential' and (
    exists (select 1 from public.job_series js where js.contact_id = c.id and js.is_active and (js.end_date is null or js.end_date >= v_today))
    or exists (select 1 from public.jobs j where j.contact_id = c.id and j.status in ('scheduled', 'in_progress', 'completed')
               and (j.scheduled_start at time zone 'America/New_York')::date between v_today - 45 and v_today + 45));

  select jsonb_build_object('accounts', count(*), 'visitsPerMonth', coalesce(sum(coalesce(a.visits_per_month, 4)), 0),
                            'monthlyValueCents', coalesce(sum(a.monthly_value_cents), 0))
  into v_comm from public.accounts a where a.status = 'active';

  select jsonb_build_object(
    'spend30Cents', coalesce(sum(d.spend_cents) filter (where d.date between v_win and v_today), 0),
    'spendMonthCents', coalesce(sum(d.spend_cents) filter (where d.date >= v_month and d.date < v_next), 0))
  into v_ads from public.marketing_daily_stats d;

  select v_ads || jsonb_build_object(
    'leads30', (select count(*) from public.leads l where l.campaign_id is not null and (l.created_at at time zone 'America/New_York')::date between v_win and v_today),
    'booked30', (select count(*) from public.leads l where l.campaign_id is not null and l.stage = 'won' and (l.created_at at time zone 'America/New_York')::date between v_win and v_today),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'platform', c.platform, 'status', c.status,
        'isDemo', c.id::text like '5eed0000-%',
        'spend30Cents', coalesce((select sum(d.spend_cents) from public.marketing_daily_stats d where d.campaign_id = c.id and d.date between v_win and v_today), 0),
        'leads30', (select count(*) from public.leads l where l.campaign_id = c.id and (l.created_at at time zone 'America/New_York')::date between v_win and v_today),
        'booked30', (select count(*) from public.leads l where l.campaign_id = c.id and l.stage = 'won' and (l.created_at at time zone 'America/New_York')::date between v_win and v_today))
        order by c.status, c.name) from public.marketing_campaigns c), '[]'),
    'recent', coalesce((select jsonb_agg(r) from (
        select jsonb_build_object('id', d.id, 'campaignId', d.campaign_id, 'campaign', c.name, 'date', d.date,
                                  'spendCents', d.spend_cents, 'isDemo', d.id::text like '5eed0000-%') as r
        from public.marketing_daily_stats d join public.marketing_campaigns c on c.id = d.campaign_id
        order by d.date desc, c.name limit 15) q), '[]'))
  into v_ads;

  select jsonb_build_object('medianMinutes', round((percentile_cont(0.5) within group (order by extract(epoch from l.first_response_at - l.created_at) / 60.0))::numeric, 1),
                            'sample', count(*))
  into v_reply from public.leads l
  where l.first_response_at is not null and (l.created_at at time zone 'America/New_York')::date between v_win and v_today;

  if p_cash then
    select coalesce(sum(p.amount_cents), 0) into v_collected from public.payments p
      where p.status = 'succeeded' and p.received_at is not null and (p.received_at at time zone 'America/New_York')::date >= s.cash_start_date;
    select coalesce(sum(r.amount_cents), 0) into v_refunds from public.refunds r
      where (r.created_at at time zone 'America/New_York')::date >= s.cash_start_date;
    select coalesce(sum(po.total_cents), 0) into v_payouts from public.payouts po
      where po.status = 'paid' and (po.paid_at at time zone 'America/New_York')::date >= s.cash_start_date;
    select coalesce(sum(d.spend_cents), 0) into v_ad_since from public.marketing_daily_stats d
      where d.date >= s.cash_start_date and d.date <= v_today;
    v_fixed_months := (extract(year from age(v_today, s.cash_start_date)) * 12 + extract(month from age(v_today, s.cash_start_date)))::integer;
    v_cash := jsonb_build_object(
      'collectedCents', v_collected - v_refunds, 'payoutsCents', v_payouts, 'adSpendCents', v_ad_since, 'fixedMonths', greatest(v_fixed_months, 0),
      'last30', jsonb_build_object(
        'collectedCents', coalesce((select sum(p.amount_cents) from public.payments p where p.status = 'succeeded' and p.received_at is not null
                                    and (p.received_at at time zone 'America/New_York')::date between v_win and v_today), 0)
                          - coalesce((select sum(r.amount_cents) from public.refunds r where (r.created_at at time zone 'America/New_York')::date between v_win and v_today), 0),
        'payoutsCents', coalesce((select sum(po.total_cents) from public.payouts po where po.status = 'paid'
                                  and (po.paid_at at time zone 'America/New_York')::date between v_win and v_today), 0),
        'adSpendCents', (v_ads ->> 'spend30Cents')::bigint));
  end if;

  return jsonb_build_object(
    'today', v_today, 'monthStart', v_month, 'nextMonthStart', v_next,
    'settings', jsonb_build_object(
      'startDate', s.start_date, 'residentialTargetCents', s.residential_target_cents, 'commercialTargetCents', s.commercial_target_cents,
      'resVisitPriceCents', s.res_visit_price_cents, 'resVisitsPerMonth', s.res_visits_per_month,
      'commAccountValueCents', s.comm_account_value_cents, 'closeRateBps', s.close_rate_bps, 'cacCents', s.cac_cents,
      'marginBps', s.margin_bps, 'monthlyAdBudgetCents', s.monthly_ad_budget_cents, 'replyTargetMinutes', s.reply_target_minutes,
      'cleansPerCleanerPerWeek', s.cleans_per_cleaner_per_week, 'startingCapitalCents', s.starting_capital_cents,
      'cashStartDate', s.cash_start_date, 'monthlyFixedCostsCents', s.monthly_fixed_costs_cents, 'minBufferCents', s.min_buffer_cents),
    'milestones', v_milestones,
    'revenue', jsonb_build_object('monthCents', private.growth_revenue_cents(v_month, v_next), 'prevMonthCents', private.growth_revenue_cents(v_prev, v_month)),
    'clients', jsonb_build_object('residentialActive', v_res_active, 'commercial', v_comm),
    'leads', jsonb_build_object(
      'last28', (select count(*) from public.leads l where (l.created_at at time zone 'America/New_York')::date >= v_today - 27),
      'wonMonthResidential', (select count(*) from public.leads l where l.stage = 'won' and coalesce(l.service_type::text, '') <> 'commercial'
                              and (l.closed_at at time zone 'America/New_York')::date >= v_month and (l.closed_at at time zone 'America/New_York')::date < v_next),
      'wonMonthCommercial', (select count(*) from public.leads l where l.stage = 'won' and l.service_type::text = 'commercial'
                             and (l.closed_at at time zone 'America/New_York')::date >= v_month and (l.closed_at at time zone 'America/New_York')::date < v_next)),
    'ads', v_ads,
    'reply', v_reply,
    'capacity', jsonb_build_object(
      'activeCleaners', (select count(*) from public.subcontractors where status = 'active'),
      'scheduledNext7Days', (select count(*) from public.jobs j where j.status in ('scheduled', 'in_progress')
                             and (j.scheduled_start at time zone 'America/New_York')::date between v_today and v_today + 6)),
    'cash', v_cash,
    'demo', jsonb_build_object(
      'adSpend', exists (select 1 from public.marketing_daily_stats where id::text like '5eed0000-%'),
      'leads', exists (select 1 from public.leads where id::text like '5eed0000-%'),
      'jobs', exists (select 1 from public.jobs where id::text like '5eed0000-%'),
      'invoices', exists (select 1 from public.invoices where id::text like '5eed0000-%'),
      'payments', exists (select 1 from public.payments where id::text like '5eed0000-%')));
end;
$$;
revoke execute on function private.growth_core(boolean) from public, anon, authenticated;

create function private.growth_inputs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  return private.growth_core(private.is_admin());
end;
$$;

-- ---------------------------------------------------------------------------
-- Public wrappers
-- ---------------------------------------------------------------------------

create function public.save_growth_plan(p_start_date date, p_residential_cents bigint, p_commercial_cents bigint, p_milestones bigint[])
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_growth_plan(p_start_date, p_residential_cents, p_commercial_cents, p_milestones) $$;
create function public.save_growth_assumptions(
  p_visit_price_cents bigint, p_visits_per_month integer, p_account_value_cents bigint, p_close_rate_bps integer,
  p_cac_cents bigint, p_margin_bps integer, p_ad_budget_cents bigint, p_reply_target_minutes integer, p_cleans_per_cleaner integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_growth_assumptions(p_visit_price_cents, p_visits_per_month, p_account_value_cents, p_close_rate_bps,
  p_cac_cents, p_margin_bps, p_ad_budget_cents, p_reply_target_minutes, p_cleans_per_cleaner) $$;
create function public.save_cash_settings(p_starting_cents bigint, p_cash_start_date date, p_fixed_cents bigint, p_buffer_cents bigint)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_cash_settings(p_starting_cents, p_cash_start_date, p_fixed_cents, p_buffer_cents) $$;
create function public.create_ad_campaign(p_platform public.marketing_platform, p_name text)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.create_ad_campaign(p_platform, p_name) $$;
create function public.record_ad_spend(p_campaign_id uuid, p_date date, p_spend_cents bigint)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_ad_spend(p_campaign_id, p_date, p_spend_cents) $$;
create function public.delete_ad_spend(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_ad_spend(p_id) $$;
create function public.growth_inputs()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.growth_inputs() $$;

-- For Roast Room, Agents and the voice AI: read-only, service role only.
create function public.growth_inputs_for_bots()
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.growth_core(true) $$;

revoke execute on function
  private.save_growth_plan(date, bigint, bigint, bigint[]),
  private.save_growth_assumptions(bigint, integer, bigint, integer, bigint, integer, bigint, integer, integer),
  private.save_cash_settings(bigint, date, bigint, bigint),
  private.create_ad_campaign(public.marketing_platform, text), private.record_ad_spend(uuid, date, bigint),
  private.delete_ad_spend(uuid), private.growth_inputs()
  from public, anon;
grant execute on function
  private.save_growth_plan(date, bigint, bigint, bigint[]),
  private.save_growth_assumptions(bigint, integer, bigint, integer, bigint, integer, bigint, integer, integer),
  private.save_cash_settings(bigint, date, bigint, bigint),
  private.create_ad_campaign(public.marketing_platform, text), private.record_ad_spend(uuid, date, bigint),
  private.delete_ad_spend(uuid), private.growth_inputs()
  to authenticated;
revoke execute on function
  public.save_growth_plan(date, bigint, bigint, bigint[]),
  public.save_growth_assumptions(bigint, integer, bigint, integer, bigint, integer, bigint, integer, integer),
  public.save_cash_settings(bigint, date, bigint, bigint),
  public.create_ad_campaign(public.marketing_platform, text), public.record_ad_spend(uuid, date, bigint),
  public.delete_ad_spend(uuid), public.growth_inputs()
  from public, anon;
grant execute on function
  public.save_growth_plan(date, bigint, bigint, bigint[]),
  public.save_growth_assumptions(bigint, integer, bigint, integer, bigint, integer, bigint, integer, integer),
  public.save_cash_settings(bigint, date, bigint, bigint),
  public.create_ad_campaign(public.marketing_platform, text), public.record_ad_spend(uuid, date, bigint),
  public.delete_ad_spend(uuid), public.growth_inputs()
  to authenticated;
revoke execute on function public.growth_inputs_for_bots() from public, anon, authenticated;
grant execute on function public.growth_inputs_for_bots() to service_role;
