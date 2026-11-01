-- Growth, part 2: the 12-month north star with tiers, profit, forecast,
-- go/no-go gates, hire triggers, channels and funnel, and the channel test.
--
-- Same rules as part 1: staff read, owner/admin change things through functions
-- that validate, run in one transaction and write finance_log (entity 'growth').
-- The database gathers raw numbers (growth_core); tiers, profit, forecast,
-- gates, funnel rules, channel rules and the recommendation live in
-- src/lib/growth*.ts so there is one tested copy. The one rule enforced in both
-- places is the cash buffer: a channel test whose planned spend would take cash
-- under the buffer cannot be saved.
-- Expenses reuse the existing table, now owner/admin only (profit is).
-- Errors: KC004 not allowed, KC005 bad input, KC001 not found.

-- ---------------------------------------------------------------------------
-- Channels on campaigns, ad spend and leads; creative on spend and leads
-- ---------------------------------------------------------------------------

alter table public.marketing_campaigns
  add column channel text not null default 'other'
  check (channel in ('meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other'));
update public.marketing_campaigns set channel = case platform when 'meta' then 'meta' when 'google' then 'google_search' else 'other' end where id is not null;

alter table public.marketing_daily_stats
  add column channel text not null default 'other' check (channel in ('meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other')),
  add column creative text check (creative is null or (length(btrim(creative)) > 0 and length(creative) <= 120));
update public.marketing_daily_stats d set channel = c.channel from public.marketing_campaigns c where c.id = d.campaign_id;

-- A spend row always carries its campaign's channel.
create function private.stats_channel_from_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.channel into new.channel from public.marketing_campaigns c where c.id = new.campaign_id;
  return new;
end;
$$;
revoke execute on function private.stats_channel_from_campaign() from public, anon, authenticated;
create trigger marketing_daily_stats_channel before insert or update of campaign_id on public.marketing_daily_stats
  for each row execute function private.stats_channel_from_campaign();

-- Several creatives can run on one campaign on one day.
alter table public.marketing_daily_stats drop constraint marketing_daily_stats_campaign_date_key;
create unique index marketing_daily_stats_campaign_date_creative_key
  on public.marketing_daily_stats (campaign_id, date, (coalesce(creative, '')));

alter table public.leads
  add column channel text not null default 'other' check (channel in ('meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other')),
  add column creative text check (creative is null or (length(btrim(creative)) > 0 and length(creative) <= 120));
update public.leads l
set channel = coalesce(
      (select c.channel from public.marketing_campaigns c where c.id = l.campaign_id),
      case l.source when 'instagram' then 'meta' when 'google' then 'google_search' when 'referral' then 'referral' when 'walk_in' then 'organic' else 'other' end),
    creative = nullif(btrim((select ct.utm_content from public.contacts ct where ct.id = l.contact_id)), '')
where l.id is not null;

-- A new lead takes its campaign's channel, else one that matches its source;
-- the creative comes from the contact's utm_content. Both can be corrected on the lead.
create function private.derive_lead_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'other' then
    new.channel := coalesce(
      (select c.channel from public.marketing_campaigns c where c.id = new.campaign_id),
      case new.source when 'instagram' then 'meta' when 'google' then 'google_search' when 'referral' then 'referral' when 'walk_in' then 'organic' else 'other' end);
  end if;
  if new.creative is null then
    new.creative := nullif(left(btrim((select ct.utm_content from public.contacts ct where ct.id = new.contact_id)), 120), '');
  end if;
  return new;
end;
$$;
revoke execute on function private.derive_lead_channel() from public, anon, authenticated;
-- Runs after leads_attribute_campaign (triggers fire alphabetically), so the campaign is known.
create trigger leads_derive_channel before insert on public.leads
  for each row execute function private.derive_lead_channel();

create index leads_channel_created_idx on public.leads (channel, created_at);

-- ---------------------------------------------------------------------------
-- Settings: tiers, forecast and channel-test rules
-- ---------------------------------------------------------------------------

alter table public.growth_settings
  add column tier text not null default 'base' check (tier in ('base', 'strong', 'north_star')),
  add column tier_base_revenue_cents bigint not null default 5000000 check (tier_base_revenue_cents > 0),
  add column tier_strong_revenue_cents bigint not null default 10000000 check (tier_strong_revenue_cents > 0),
  add column tier_north_profit_cents bigint not null default 5000000 check (tier_north_profit_cents > 0),
  add column monthly_churn_bps integer not null default 500 check (monthly_churn_bps between 0 and 10000),
  add column cleans_per_crew_per_week integer not null default 25 check (cleans_per_crew_per_week between 1 and 300),
  add column test_judge_spend_cents bigint not null default 75000 check (test_judge_spend_cents >= 0),
  add column test_judge_leads integer not null default 20 check (test_judge_leads >= 1),
  -- 150 = a channel is a loser at 1.5x the best channel's cost per booked client.
  add column test_loser_ratio_x100 integer not null default 150 check (test_loser_ratio_x100 >= 101),
  add column test_daily_week1_cents bigint not null default 2000 check (test_daily_week1_cents >= 0),
  add column test_daily_after_cents bigint not null default 3000 check (test_daily_after_cents >= 0),
  add column test_window_weeks integer not null default 4 check (test_window_weeks between 1 and 26),
  add column test_start_date date;

create table public.channel_test_plan (
  channel text primary key check (channel in ('meta', 'google_search', 'google_lsa')),
  enabled boolean not null default true
);
insert into public.channel_test_plan (channel) values ('meta'), ('google_search'), ('google_lsa');

create table public.growth_gate_criteria (
  checkpoint text not null check (checkpoint in ('day30', 'month3', 'month6', 'month9', 'month12')),
  metric text not null check (metric in ('channels_judged', 'reply_minutes', 'clients_booked', 'month_revenue_cents', 'cost_to_win_cents', 'payback_tenths', 'margin_bps', 'base_tier_revenue')),
  -- Money in cents, minutes, counts, basis points; payback in tenths of a month (30 = 3.0).
  threshold bigint not null check (threshold >= 0),
  enabled boolean not null default true,
  primary key (checkpoint, metric)
);
insert into public.growth_gate_criteria (checkpoint, metric, threshold) values
  ('day30', 'channels_judged', 1), ('day30', 'reply_minutes', 5), ('day30', 'clients_booked', 3),
  ('month3', 'month_revenue_cents', 400000), ('month3', 'cost_to_win_cents', 30000), ('month3', 'payback_tenths', 30),
  ('month6', 'month_revenue_cents', 1000000), ('month6', 'margin_bps', 3000),
  ('month9', 'month_revenue_cents', 3000000),
  ('month12', 'base_tier_revenue', 0);

create table public.growth_hire_triggers (
  key text primary key check (key in ('clients', 'leads_per_week', 'crews_short')),
  label text not null check (length(btrim(label)) > 0),
  threshold bigint not null check (threshold >= 0),
  enabled boolean not null default true
);
insert into public.growth_hire_triggers (key, label, threshold) values
  ('clients', 'Add office help (scheduling and billing)', 30),
  ('leads_per_week', 'Add someone to answer leads', 15),
  ('crews_short', 'Recruit another crew', 1);

create table public.growth_decisions (
  id uuid primary key default gen_random_uuid(),
  decided_on date not null,
  kind text not null default 'general' check (kind in ('general', 'gate', 'channel', 'hire')),
  note text not null check (length(btrim(note)) > 0 and length(note) <= 2000),
  decision text not null check (length(btrim(decision)) > 0 and length(decision) <= 300),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index growth_decisions_decided_idx on public.growth_decisions (decided_on desc);
create index growth_decisions_created_by_idx on public.growth_decisions (created_by);

alter table public.channel_test_plan enable row level security;
alter table public.growth_gate_criteria enable row level security;
alter table public.growth_hire_triggers enable row level security;
alter table public.growth_decisions enable row level security;
revoke all on public.channel_test_plan, public.growth_gate_criteria, public.growth_hire_triggers, public.growth_decisions from anon;
revoke insert, update, delete on public.channel_test_plan, public.growth_gate_criteria, public.growth_hire_triggers, public.growth_decisions from authenticated;
create policy "channel_test_plan: staff read" on public.channel_test_plan for select to authenticated using ((select private.is_staff()));
create policy "growth_gate_criteria: staff read" on public.growth_gate_criteria for select to authenticated using ((select private.is_staff()));
create policy "growth_hire_triggers: staff read" on public.growth_hire_triggers for select to authenticated using ((select private.is_staff()));
create policy "growth_decisions: staff read" on public.growth_decisions for select to authenticated using ((select private.is_staff()));

-- Expenses: owner/admin only (they feed profit), written through functions.
drop policy "expenses: staff read" on public.expenses;
drop policy "expenses: staff insert" on public.expenses;
drop policy "expenses: staff update" on public.expenses;
drop policy "expenses: admin delete" on public.expenses;
revoke insert, update, delete on public.expenses from authenticated;
create policy "expenses: admin read" on public.expenses for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Cash on hand (the same formula as src/lib/growth.ts cashPosition)
-- ---------------------------------------------------------------------------

create function private.growth_cash_on_hand()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.growth_settings%rowtype;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_collected bigint; v_refunds bigint; v_payouts bigint; v_ads bigint; v_months integer;
begin
  select * into s from public.growth_settings where id;
  select coalesce(sum(p.amount_cents), 0) into v_collected from public.payments p
    where p.status = 'succeeded' and p.received_at is not null and (p.received_at at time zone 'America/New_York')::date >= s.cash_start_date;
  select coalesce(sum(r.amount_cents), 0) into v_refunds from public.refunds r where (r.created_at at time zone 'America/New_York')::date >= s.cash_start_date;
  select coalesce(sum(po.total_cents), 0) into v_payouts from public.payouts po
    where po.status = 'paid' and (po.paid_at at time zone 'America/New_York')::date >= s.cash_start_date;
  select coalesce(sum(d.spend_cents), 0) into v_ads from public.marketing_daily_stats d where d.date >= s.cash_start_date and d.date <= v_today;
  v_months := greatest((extract(year from age(v_today, s.cash_start_date)) * 12 + extract(month from age(v_today, s.cash_start_date)))::integer, 0);
  return s.starting_capital_cents + v_collected - v_refunds - v_payouts - v_ads - v_months * s.monthly_fixed_costs_cents;
end;
$$;
revoke execute on function private.growth_cash_on_hand() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writes (owner/admin only)
-- ---------------------------------------------------------------------------

create function private.save_tier_settings(p_tier text, p_base_cents bigint, p_strong_cents bigint, p_north_profit_cents bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.growth_settings%rowtype;
begin
  perform private.require_admin();
  if p_tier not in ('base', 'strong', 'north_star') or p_base_cents <= 0 or p_strong_cents <= p_base_cents or p_north_profit_cents <= 0 then
    raise exception 'pick a tier; the strong tier must be above the base tier and the profit target above zero' using errcode = 'KC005';
  end if;
  select * into v_old from public.growth_settings where id;
  update public.growth_settings
  set tier = p_tier, tier_base_revenue_cents = p_base_cents, tier_strong_revenue_cents = p_strong_cents,
      tier_north_profit_cents = p_north_profit_cents, updated_by = (select auth.uid())
  where id;
  perform private.log_finance('growth', null, 'tiers_saved', jsonb_build_object(
    'tier', jsonb_build_array(v_old.tier, p_tier),
    'base', jsonb_build_array(v_old.tier_base_revenue_cents, p_base_cents),
    'strong', jsonb_build_array(v_old.tier_strong_revenue_cents, p_strong_cents),
    'north_profit', jsonb_build_array(v_old.tier_north_profit_cents, p_north_profit_cents)));
end;
$$;

create function private.save_forecast_assumptions(p_churn_bps integer, p_cleans_per_crew integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.growth_settings%rowtype;
begin
  perform private.require_admin();
  if p_churn_bps not between 0 and 10000 or p_cleans_per_crew not between 1 and 300 then
    raise exception 'churn must be 0 to 100 percent and a crew does 1 to 300 cleans a week' using errcode = 'KC005';
  end if;
  select * into v_old from public.growth_settings where id;
  update public.growth_settings set monthly_churn_bps = p_churn_bps, cleans_per_crew_per_week = p_cleans_per_crew, updated_by = (select auth.uid()) where id;
  perform private.log_finance('growth', null, 'forecast_saved', jsonb_build_object(
    'monthly_churn_bps', jsonb_build_array(v_old.monthly_churn_bps, p_churn_bps),
    'cleans_per_crew_per_week', jsonb_build_array(v_old.cleans_per_crew_per_week, p_cleans_per_crew)));
end;
$$;

create function private.save_gate_criteria(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  perform private.require_admin();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'send the gate criteria to save' using errcode = 'KC005';
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(checkpoint text, metric text, threshold bigint, enabled boolean) loop
    if r.threshold is null or r.threshold < 0 or r.enabled is null then
      raise exception 'each criterion needs a threshold of zero or more' using errcode = 'KC005';
    end if;
    update public.growth_gate_criteria g
    set threshold = r.threshold, enabled = r.enabled
    where g.checkpoint = r.checkpoint and g.metric = r.metric;
    if not found then
      raise exception 'unknown gate criterion %/%', r.checkpoint, r.metric using errcode = 'KC005';
    end if;
    n := n + 1;
  end loop;
  perform private.log_finance('growth', null, 'gates_saved', jsonb_build_object('criteria', p_rows));
end;
$$;

create function private.save_hire_triggers(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform private.require_admin();
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'send the hire triggers to save' using errcode = 'KC005';
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(key text, label text, threshold bigint, enabled boolean) loop
    if r.label is null or length(btrim(r.label)) = 0 or length(r.label) > 120 or r.threshold is null or r.threshold < 0 or r.enabled is null then
      raise exception 'each hire trigger needs a label and a threshold of zero or more' using errcode = 'KC005';
    end if;
    update public.growth_hire_triggers t set label = btrim(r.label), threshold = r.threshold, enabled = r.enabled where t.key = r.key;
    if not found then
      raise exception 'unknown hire trigger %', r.key using errcode = 'KC005';
    end if;
  end loop;
  perform private.log_finance('growth', null, 'hire_triggers_saved', jsonb_build_object('triggers', p_rows));
end;
$$;

create function private.add_growth_decision(p_date date, p_kind text, p_note text, p_decision text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_date is null or p_date > (now() at time zone 'America/New_York')::date + 1 or p_kind not in ('general', 'gate', 'channel', 'hire')
     or p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 2000 or p_decision is null or length(btrim(p_decision)) = 0 or length(p_decision) > 300 then
    raise exception 'a decision needs a date, a note and the decision itself' using errcode = 'KC005';
  end if;
  insert into public.growth_decisions (decided_on, kind, note, decision, created_by)
  values (p_date, p_kind, btrim(p_note), btrim(p_decision), (select auth.uid())) returning id into v_id;
  perform private.log_finance('growth', v_id, 'decision_logged', jsonb_build_object('kind', p_kind, 'decision', btrim(p_decision)));
  return v_id;
end;
$$;

create function private.delete_growth_decision(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.growth_decisions where id = p_id;
  if not found then
    raise exception 'that decision was already removed' using errcode = 'KC001';
  end if;
  perform private.log_finance('growth', p_id, 'decision_deleted', '{}');
end;
$$;

create function private.record_expense(p_category public.expense_category, p_amount_cents bigint, p_date date, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_id uuid;
begin
  perform private.require_admin();
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'enter an amount above zero, up to $1,000,000' using errcode = 'KC005';
  end if;
  if p_date is null or p_date > v_today or p_date < v_today - 800 then
    raise exception 'the date must be in the past two years and not in the future' using errcode = 'KC005';
  end if;
  if p_description is not null and length(p_description) > 200 then
    raise exception 'keep the description under 200 characters' using errcode = 'KC005';
  end if;
  insert into public.expenses (category, description, amount_cents, incurred_on, created_by)
  values (p_category, coalesce(nullif(btrim(p_description), ''), initcap(p_category::text)), p_amount_cents, p_date, (select auth.uid()))
  returning id into v_id;
  perform private.log_finance('growth', v_id, 'expense_recorded', jsonb_build_object('category', p_category, 'amount_cents', p_amount_cents, 'date', p_date));
  return v_id;
end;
$$;

create function private.delete_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.expenses%rowtype;
begin
  perform private.require_admin();
  delete from public.expenses where id = p_id returning * into v_row;
  if not found then
    raise exception 'that expense was already removed' using errcode = 'KC001';
  end if;
  perform private.log_finance('growth', p_id, 'expense_deleted', jsonb_build_object('category', v_row.category, 'amount_cents', v_row.amount_cents, 'date', v_row.incurred_on));
end;
$$;

-- The channel test: rules, budgets, window, which channels, and the cash buffer.
create function private.save_channel_test(
  p_judge_spend_cents bigint, p_judge_leads integer, p_loser_ratio_x100 integer,
  p_daily_week1_cents bigint, p_daily_after_cents bigint, p_window_weeks integer, p_start_date date, p_channels text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.growth_settings%rowtype;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_n integer := coalesce(cardinality(p_channels), 0);
  v_planned bigint;
  v_spent bigint := 0;
  v_remaining bigint;
  v_room bigint;
  s public.growth_settings%rowtype;
begin
  perform private.require_admin();
  if p_judge_spend_cents < 0 or p_judge_leads < 1 or p_loser_ratio_x100 < 101 or p_daily_week1_cents < 0 or p_daily_after_cents < 0
     or p_window_weeks not between 1 and 26 or (p_start_date is not null and p_start_date > v_today + 60) then
    raise exception 'check the test rules: budgets can''t be negative and the test runs 1 to 26 weeks' using errcode = 'KC005';
  end if;
  if exists (select 1 from unnest(p_channels) c where c not in ('meta', 'google_search', 'google_lsa')) then
    raise exception 'only Meta, Google Search and Google LSA can be tested with a budget' using errcode = 'KC005';
  end if;
  select * into v_old from public.growth_settings where id;
  s := v_old;
  -- Planned over the window: week 1 at the first daily budget, the rest at the second, per channel.
  v_planned := v_n * 7 * (p_daily_week1_cents + (p_window_weeks - 1) * p_daily_after_cents);
  if p_start_date is not null and v_n > 0 then
    select coalesce(sum(d.spend_cents), 0) into v_spent
    from public.marketing_daily_stats d
    where d.channel = any(p_channels) and d.date >= p_start_date and d.date <= v_today;
  end if;
  v_remaining := greatest(v_planned - v_spent, 0);
  v_room := private.growth_cash_on_hand() - s.min_buffer_cents;
  if v_remaining > greatest(v_room, 0) then
    raise exception 'the test would spend % more, but only % of cash is above the % buffer',
      '$' || round(v_remaining / 100.0)::text, '$' || round(greatest(v_room, 0) / 100.0)::text, '$' || round(s.min_buffer_cents / 100.0)::text
      using errcode = 'KC005';
  end if;
  update public.growth_settings
  set test_judge_spend_cents = p_judge_spend_cents, test_judge_leads = p_judge_leads, test_loser_ratio_x100 = p_loser_ratio_x100,
      test_daily_week1_cents = p_daily_week1_cents, test_daily_after_cents = p_daily_after_cents,
      test_window_weeks = p_window_weeks, test_start_date = p_start_date, updated_by = (select auth.uid())
  where id;
  update public.channel_test_plan set enabled = (channel = any(coalesce(p_channels, '{}'))) where channel is not null;
  perform private.log_finance('growth', null, 'channel_test_saved', jsonb_build_object(
    'judge_spend_cents', jsonb_build_array(v_old.test_judge_spend_cents, p_judge_spend_cents),
    'judge_leads', jsonb_build_array(v_old.test_judge_leads, p_judge_leads),
    'loser_ratio_x100', jsonb_build_array(v_old.test_loser_ratio_x100, p_loser_ratio_x100),
    'daily_week1_cents', jsonb_build_array(v_old.test_daily_week1_cents, p_daily_week1_cents),
    'daily_after_cents', jsonb_build_array(v_old.test_daily_after_cents, p_daily_after_cents),
    'window_weeks', jsonb_build_array(v_old.test_window_weeks, p_window_weeks),
    'start_date', jsonb_build_array(v_old.test_start_date, p_start_date),
    'channels', to_jsonb(p_channels), 'planned_cents', v_planned, 'remaining_cents', v_remaining));
end;
$$;

-- Campaign and spend functions grow a channel and a creative.
drop function public.create_ad_campaign(public.marketing_platform, text);
drop function private.create_ad_campaign(public.marketing_platform, text);
create function private.create_ad_campaign(p_platform public.marketing_platform, p_name text, p_channel text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_channel text := coalesce(p_channel, case p_platform when 'meta' then 'meta' when 'google' then 'google_search' else 'other' end);
begin
  perform private.require_admin();
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 120 then
    raise exception 'give the campaign a name (up to 120 characters)' using errcode = 'KC005';
  end if;
  if v_channel not in ('meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other') then
    raise exception 'pick a channel from the list' using errcode = 'KC005';
  end if;
  insert into public.marketing_campaigns (platform, name, status, start_date, channel)
  values (p_platform, btrim(p_name), 'active', (now() at time zone 'America/New_York')::date, v_channel)
  returning id into v_id;
  perform private.log_finance('growth', v_id, 'campaign_created', jsonb_build_object('platform', p_platform, 'name', btrim(p_name), 'channel', v_channel));
  return v_id;
end;
$$;

drop function public.record_ad_spend(uuid, date, bigint);
drop function private.record_ad_spend(uuid, date, bigint);
create function private.record_ad_spend(p_campaign_id uuid, p_date date, p_spend_cents bigint, p_creative text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_id uuid;
  v_old bigint;
  v_creative text := nullif(btrim(p_creative), '');
begin
  perform private.require_admin();
  if p_date is null or p_date > v_today or p_date < v_today - 400 then
    raise exception 'the date must be within the last year and not in the future' using errcode = 'KC005';
  end if;
  if p_spend_cents is null or p_spend_cents < 0 or p_spend_cents > 100000000 then
    raise exception 'enter the spend in dollars, up to $1,000,000' using errcode = 'KC005';
  end if;
  if v_creative is not null and length(v_creative) > 120 then
    raise exception 'keep the creative name under 120 characters' using errcode = 'KC005';
  end if;
  if not exists (select 1 from public.marketing_campaigns where id = p_campaign_id) then
    raise exception 'that campaign no longer exists' using errcode = 'KC001';
  end if;
  select spend_cents into v_old from public.marketing_daily_stats
    where campaign_id = p_campaign_id and date = p_date and coalesce(creative, '') = coalesce(v_creative, '');
  insert into public.marketing_daily_stats (campaign_id, date, spend_cents, creative)
  values (p_campaign_id, p_date, p_spend_cents, v_creative)
  on conflict (campaign_id, date, (coalesce(creative, ''))) do update set spend_cents = excluded.spend_cents
  returning id into v_id;
  perform private.log_finance('growth', v_id, 'ad_spend_recorded', jsonb_build_object(
    'campaign_id', p_campaign_id, 'date', p_date, 'spend_cents', p_spend_cents, 'creative', v_creative, 'previous_cents', v_old));
  return v_id;
end;
$$;

-- Office staff correct a lead's channel and creative from the lead.
create function private.set_lead_attribution(p_lead_id uuid, p_channel text, p_creative text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creative text := nullif(btrim(p_creative), '');
  v_updated timestamptz;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  if p_channel not in ('meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other') or (v_creative is not null and length(v_creative) > 120) then
    raise exception 'pick a channel from the list; the creative can be up to 120 characters' using errcode = 'KC005';
  end if;
  update public.leads set channel = p_channel, creative = v_creative where id = p_lead_id returning updated_at into v_updated;
  if not found then
    raise exception 'that lead no longer exists' using errcode = 'KC001';
  end if;
  insert into public.activities (type, subject, lead_id, actor_user_id)
  values ('note', 'Attribution set to ' || p_channel || coalesce(' / ' || v_creative, ''), p_lead_id, (select auth.uid()));
  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Raw numbers for profit, funnel, churn, gates and the channel test
-- ---------------------------------------------------------------------------

alter function private.growth_core(boolean) rename to growth_core_base;

create function private.growth_extra(p_admin boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.growth_settings%rowtype;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_win date := (now() at time zone 'America/New_York')::date - 89;
  v_test_from date;
  v_months jsonb;
  v_expenses jsonb := null;
  v_funnel jsonb;
  v_reply jsonb;
  v_churn jsonb;
  v_test jsonb;
begin
  select * into s from public.growth_settings where id;
  v_test_from := coalesce(s.test_start_date, v_win);

  select coalesce(jsonb_agg(jsonb_build_object(
      'monthStart', m.ms,
      'revenueCents', private.growth_revenue_cents(m.ms, m.nx),
      'adSpendCents', (select coalesce(sum(d.spend_cents), 0) from public.marketing_daily_stats d where d.date >= m.ms and d.date < m.nx),
      'subPayCents', case when p_admin then (select coalesce(sum(a.pay_cents), 0) from public.job_assignments a join public.jobs j on j.id = a.job_id
                        where j.status = 'completed' and (j.completed_at at time zone 'America/New_York')::date >= m.ms and (j.completed_at at time zone 'America/New_York')::date < m.nx) end,
      'otherCostsCents', case when p_admin then (select coalesce(sum(e.amount_cents), 0) from public.expenses e where e.incurred_on >= m.ms and e.incurred_on < m.nx) end)
    order by m.ms), '[]')
  into v_months
  from (select g.ms::date as ms, (g.ms + interval '1 month')::date as nx
        from (select date_trunc('month', (now() at time zone 'America/New_York')) - make_interval(months => n) as ms from generate_series(0, 12) n) g) m;

  if p_admin then
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'description', e.description, 'amountCents', e.amount_cents,
             'date', e.incurred_on, 'isDemo', e.id::text like '5eed0000-%') order by e.incurred_on desc, e.created_at desc), '[]')
    into v_expenses from (select * from public.expenses order by incurred_on desc, created_at desc limit 20) e;
  end if;

  -- Funnel over the last 90 days of leads, with the spend of the same days.
  with lf as (
    select l.id, l.channel, l.campaign_id, coalesce(l.creative, '') as creative,
           (l.first_response_at is not null or l.stage in ('contacted', 'quoted', 'won')) as contacted,
           (l.stage in ('quoted', 'won') or exists (select 1 from public.quotes q where q.lead_id = l.id and q.status <> 'draft')) as quoted,
           (l.stage = 'won') as booked,
           (l.stage = 'won' and exists (select 1 from public.jobs j where j.contact_id = l.contact_id and j.status = 'completed')) as first_clean,
           (l.stage = 'won' and exists (select 1 from public.job_series js where js.contact_id = l.contact_id)) as recurring
    from public.leads l
    where (l.created_at at time zone 'America/New_York')::date between v_win and v_today),
  sp as (
    select d.channel, d.campaign_id, coalesce(d.creative, '') as creative, d.spend_cents
    from public.marketing_daily_stats d where d.date between v_win and v_today),
  chn as (
    select k.channel, count(lf.id) as leads, count(lf.id) filter (where lf.contacted) as contacted, count(lf.id) filter (where lf.quoted) as quoted,
           count(lf.id) filter (where lf.booked) as booked, count(lf.id) filter (where lf.first_clean) as first_clean,
           count(lf.id) filter (where lf.recurring) as recurring
    from (select unnest(array['meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other']) as channel) k
    left join lf on lf.channel = k.channel group by k.channel),
  chs as (select channel, sum(spend_cents) as spend from sp group by channel),
  cmp as (
    select c.id, c.name, c.channel, count(lf.id) as leads, count(lf.id) filter (where lf.contacted) as contacted, count(lf.id) filter (where lf.quoted) as quoted,
           count(lf.id) filter (where lf.booked) as booked, count(lf.id) filter (where lf.first_clean) as first_clean,
           count(lf.id) filter (where lf.recurring) as recurring
    from public.marketing_campaigns c left join lf on lf.campaign_id = c.id group by c.id, c.name, c.channel),
  cms as (select campaign_id, sum(spend_cents) as spend from sp group by campaign_id),
  crv as (
    select x.channel, x.creative, count(lf.id) as leads, count(lf.id) filter (where lf.contacted) as contacted, count(lf.id) filter (where lf.quoted) as quoted,
           count(lf.id) filter (where lf.booked) as booked, count(lf.id) filter (where lf.first_clean) as first_clean,
           count(lf.id) filter (where lf.recurring) as recurring
    from (select channel, creative from lf where creative <> '' union select channel, creative from sp where creative <> '') x
    left join lf on lf.channel = x.channel and lf.creative = x.creative group by x.channel, x.creative),
  crs as (select channel, creative, sum(spend_cents) as spend from sp where creative <> '' group by channel, creative)
  select jsonb_build_object(
    'channels', (select jsonb_agg(jsonb_build_object('key', chn.channel, 'leads', chn.leads, 'contacted', chn.contacted, 'quoted', chn.quoted, 'booked', chn.booked,
                  'firstClean', chn.first_clean, 'recurring', chn.recurring, 'spendCents', coalesce(chs.spend, 0)) order by chn.channel)
                 from chn left join chs on chs.channel = chn.channel),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('key', cmp.id, 'name', cmp.name, 'channel', cmp.channel, 'leads', cmp.leads, 'contacted', cmp.contacted,
                  'quoted', cmp.quoted, 'booked', cmp.booked, 'firstClean', cmp.first_clean, 'recurring', cmp.recurring, 'spendCents', coalesce(cms.spend, 0),
                  'isDemo', cmp.id::text like '5eed0000-%') order by cmp.name)
                 from cmp left join cms on cms.campaign_id = cmp.id where cmp.leads > 0 or coalesce(cms.spend, 0) > 0), '[]'),
    'creatives', coalesce((select jsonb_agg(jsonb_build_object('key', crv.creative, 'channel', crv.channel, 'leads', crv.leads, 'contacted', crv.contacted,
                  'quoted', crv.quoted, 'booked', crv.booked, 'firstClean', crv.first_clean, 'recurring', crv.recurring, 'spendCents', coalesce(crs.spend, 0))
                  order by crv.channel, crv.creative)
                 from crv left join crs on crs.channel = crv.channel and crs.creative = crv.creative), '[]'))
  into v_funnel;

  select jsonb_build_object(
    'under5', jsonb_build_object('leads', count(*) filter (where q.m < 5), 'booked', count(*) filter (where q.m < 5 and q.stage = 'won')),
    'under60', jsonb_build_object('leads', count(*) filter (where q.m >= 5 and q.m < 60), 'booked', count(*) filter (where q.m >= 5 and q.m < 60 and q.stage = 'won')),
    'over60', jsonb_build_object('leads', count(*) filter (where q.m >= 60), 'booked', count(*) filter (where q.m >= 60 and q.stage = 'won')),
    'unanswered', (select count(*) from public.leads l where l.first_response_at is null and (l.created_at at time zone 'America/New_York')::date between v_win and v_today))
  into v_reply
  from (select l.stage, extract(epoch from l.first_response_at - l.created_at) / 60.0 as m from public.leads l
        where l.first_response_at is not null and (l.created_at at time zone 'America/New_York')::date between v_win and v_today) q;

  -- Residential recurring churn by month: a client counts as recurring from the day a series starts until it ends (a cancelled series ends on the day it was switched off).
  with ser as (
    select js.contact_id, js.start_date,
           coalesce(js.end_date, case when js.is_active then null else (js.updated_at at time zone 'America/New_York')::date end) as eff_end
    from public.job_series js where js.contact_id is not null),
  mo as (select (date_trunc('month', (now() at time zone 'America/New_York')) - make_interval(months => n))::date as ms,
                (date_trunc('month', (now() at time zone 'America/New_York')) - make_interval(months => n) + interval '1 month')::date as nx
         from generate_series(0, 5) n)
  select coalesce(jsonb_agg(jsonb_build_object(
    'monthStart', mo.ms,
    'startRecurring', (select count(distinct s1.contact_id) from ser s1 where s1.start_date < mo.ms and (s1.eff_end is null or s1.eff_end >= mo.ms)),
    'cancellations', (select count(distinct s2.contact_id) from ser s2
                      where s2.eff_end >= mo.ms and s2.eff_end < mo.nx and s2.start_date < mo.ms
                        and not exists (select 1 from ser s3 where s3.contact_id = s2.contact_id and s3.start_date < mo.nx and (s3.eff_end is null or s3.eff_end >= mo.nx)))
  ) order by mo.ms), '[]')
  into v_churn from mo;

  -- Channel test numbers: since the test started (else the last 90 days), plus the last 14 days against the 14 before.
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', k.channel,
    'enabled', coalesce((select p.enabled from public.channel_test_plan p where p.channel = k.channel), false),
    'spendCents', (select coalesce(sum(d.spend_cents), 0) from public.marketing_daily_stats d where d.channel = k.channel and d.date between v_test_from and v_today),
    'leads', (select count(*) from public.leads l where l.channel = k.channel and (l.created_at at time zone 'America/New_York')::date between v_test_from and v_today),
    'booked', (select count(*) from public.leads l where l.channel = k.channel and l.stage = 'won' and (l.created_at at time zone 'America/New_York')::date between v_test_from and v_today),
    'recent', jsonb_build_object(
      'spendCents', (select coalesce(sum(d.spend_cents), 0) from public.marketing_daily_stats d where d.channel = k.channel and d.date between v_today - 13 and v_today),
      'leads', (select count(*) from public.leads l where l.channel = k.channel and (l.created_at at time zone 'America/New_York')::date between v_today - 13 and v_today)),
    'prior', jsonb_build_object(
      'spendCents', (select coalesce(sum(d.spend_cents), 0) from public.marketing_daily_stats d where d.channel = k.channel and d.date between v_today - 27 and v_today - 14),
      'leads', (select count(*) from public.leads l where l.channel = k.channel and (l.created_at at time zone 'America/New_York')::date between v_today - 27 and v_today - 14))
  ) order by k.channel), '[]')
  into v_test
  from (select unnest(array['meta', 'google_search', 'google_lsa', 'referral', 'organic', 'other']) as channel) k;

  return jsonb_build_object(
    'settingsExtra', jsonb_build_object(
      'tier', s.tier, 'tierBaseRevenueCents', s.tier_base_revenue_cents, 'tierStrongRevenueCents', s.tier_strong_revenue_cents,
      'tierNorthProfitCents', s.tier_north_profit_cents, 'monthlyChurnBps', s.monthly_churn_bps, 'cleansPerCrewPerWeek', s.cleans_per_crew_per_week,
      'testJudgeSpendCents', s.test_judge_spend_cents, 'testJudgeLeads', s.test_judge_leads, 'testLoserRatioX100', s.test_loser_ratio_x100,
      'testDailyWeek1Cents', s.test_daily_week1_cents, 'testDailyAfterCents', s.test_daily_after_cents, 'testWindowWeeks', s.test_window_weeks,
      'testStartDate', s.test_start_date),
    'months', v_months,
    'expenses', v_expenses,
    'funnel', v_funnel,
    'replyBuckets', v_reply,
    'churn', v_churn,
    'channelTest', jsonb_build_object('channels', v_test, 'fromDate', v_test_from),
    'gateCriteria', (select coalesce(jsonb_agg(jsonb_build_object('checkpoint', g.checkpoint, 'metric', g.metric, 'threshold', g.threshold, 'enabled', g.enabled)
                       order by g.checkpoint, g.metric), '[]') from public.growth_gate_criteria g),
    'hireTriggers', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label, 'threshold', t.threshold, 'enabled', t.enabled) order by t.key), '[]')
                     from public.growth_hire_triggers t),
    'decisions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'date', x.decided_on, 'kind', x.kind, 'note', x.note, 'decision', x.decision) order by x.decided_on desc, x.created_at desc), '[]')
                  from (select * from public.growth_decisions order by decided_on desc, created_at desc limit 30) x),
    'wonSincePlanStart', (select count(*) from public.leads l where l.stage = 'won' and (l.closed_at at time zone 'America/New_York')::date >= s.start_date),
    'activeCrews', (select count(*) from public.crews where is_active),
    'cashOnHandCents', case when p_admin then private.growth_cash_on_hand() end);
end;
$$;
revoke execute on function private.growth_extra(boolean) from public, anon, authenticated;

create function private.growth_core(p_cash boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select private.growth_core_base(p_cash) || private.growth_extra(p_cash) $$;
revoke execute on function private.growth_core(boolean) from public, anon, authenticated;
revoke execute on function private.growth_core_base(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public wrappers
-- ---------------------------------------------------------------------------

create function public.save_tier_settings(p_tier text, p_base_cents bigint, p_strong_cents bigint, p_north_profit_cents bigint)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_tier_settings(p_tier, p_base_cents, p_strong_cents, p_north_profit_cents) $$;
create function public.save_forecast_assumptions(p_churn_bps integer, p_cleans_per_crew integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_forecast_assumptions(p_churn_bps, p_cleans_per_crew) $$;
create function public.save_gate_criteria(p_rows jsonb)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_gate_criteria(p_rows) $$;
create function public.save_hire_triggers(p_rows jsonb)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_hire_triggers(p_rows) $$;
create function public.add_growth_decision(p_date date, p_kind text, p_note text, p_decision text)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.add_growth_decision(p_date, p_kind, p_note, p_decision) $$;
create function public.delete_growth_decision(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_growth_decision(p_id) $$;
create function public.record_expense(p_category public.expense_category, p_amount_cents bigint, p_date date, p_description text default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_expense(p_category, p_amount_cents, p_date, p_description) $$;
create function public.delete_expense(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_expense(p_id) $$;
create function public.save_channel_test(
  p_judge_spend_cents bigint, p_judge_leads integer, p_loser_ratio_x100 integer,
  p_daily_week1_cents bigint, p_daily_after_cents bigint, p_window_weeks integer, p_start_date date, p_channels text[])
returns void language sql volatile security invoker set search_path = ''
as $$ select private.save_channel_test(p_judge_spend_cents, p_judge_leads, p_loser_ratio_x100, p_daily_week1_cents, p_daily_after_cents, p_window_weeks, p_start_date, p_channels) $$;
create function public.create_ad_campaign(p_platform public.marketing_platform, p_name text, p_channel text default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.create_ad_campaign(p_platform, p_name, p_channel) $$;
create function public.record_ad_spend(p_campaign_id uuid, p_date date, p_spend_cents bigint, p_creative text default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_ad_spend(p_campaign_id, p_date, p_spend_cents, p_creative) $$;
create function public.set_lead_attribution(p_lead_id uuid, p_channel text, p_creative text default null)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.set_lead_attribution(p_lead_id, p_channel, p_creative) $$;

revoke execute on function
  private.save_tier_settings(text, bigint, bigint, bigint), private.save_forecast_assumptions(integer, integer),
  private.save_gate_criteria(jsonb), private.save_hire_triggers(jsonb), private.add_growth_decision(date, text, text, text),
  private.delete_growth_decision(uuid), private.record_expense(public.expense_category, bigint, date, text), private.delete_expense(uuid),
  private.save_channel_test(bigint, integer, integer, bigint, bigint, integer, date, text[]),
  private.create_ad_campaign(public.marketing_platform, text, text), private.record_ad_spend(uuid, date, bigint, text),
  private.set_lead_attribution(uuid, text, text),
  public.save_tier_settings(text, bigint, bigint, bigint), public.save_forecast_assumptions(integer, integer),
  public.save_gate_criteria(jsonb), public.save_hire_triggers(jsonb), public.add_growth_decision(date, text, text, text),
  public.delete_growth_decision(uuid), public.record_expense(public.expense_category, bigint, date, text), public.delete_expense(uuid),
  public.save_channel_test(bigint, integer, integer, bigint, bigint, integer, date, text[]),
  public.create_ad_campaign(public.marketing_platform, text, text), public.record_ad_spend(uuid, date, bigint, text),
  public.set_lead_attribution(uuid, text, text)
  from public, anon;
grant execute on function
  private.save_tier_settings(text, bigint, bigint, bigint), private.save_forecast_assumptions(integer, integer),
  private.save_gate_criteria(jsonb), private.save_hire_triggers(jsonb), private.add_growth_decision(date, text, text, text),
  private.delete_growth_decision(uuid), private.record_expense(public.expense_category, bigint, date, text), private.delete_expense(uuid),
  private.save_channel_test(bigint, integer, integer, bigint, bigint, integer, date, text[]),
  private.create_ad_campaign(public.marketing_platform, text, text), private.record_ad_spend(uuid, date, bigint, text),
  private.set_lead_attribution(uuid, text, text),
  public.save_tier_settings(text, bigint, bigint, bigint), public.save_forecast_assumptions(integer, integer),
  public.save_gate_criteria(jsonb), public.save_hire_triggers(jsonb), public.add_growth_decision(date, text, text, text),
  public.delete_growth_decision(uuid), public.record_expense(public.expense_category, bigint, date, text), public.delete_expense(uuid),
  public.save_channel_test(bigint, integer, integer, bigint, bigint, integer, date, text[]),
  public.create_ad_campaign(public.marketing_platform, text, text), public.record_ad_spend(uuid, date, bigint, text),
  public.set_lead_attribution(uuid, text, text)
  to authenticated;
