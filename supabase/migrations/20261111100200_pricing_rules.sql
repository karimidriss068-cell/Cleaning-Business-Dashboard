-- Pricing rules: the owner's own numbers for bids (labor, materials, margin, minimum, rush, and a rate
-- and productivity per kind of space). One row of rules plus one row per space type, replaced together by
-- save_pricing_rules, which bumps a version so every bid can say which rules it used. Owner and admin only.
-- Every number seeded here is a PLACEHOLDER (confirmed_at stays null until the owner saves once).

alter table public.finance_log drop constraint finance_log_entity_check;
alter table public.finance_log add constraint finance_log_entity_check
  check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings', 'growth', 'ghl', 'ai', 'board', 'pricing', 'bid', 'project'));

create table public.pricing_rules (
  id boolean primary key default true check (id),
  version integer not null default 1 check (version >= 1),
  -- What one cleaner-hour costs us, and how many cleaners a crew usually has.
  labor_rate_cents integer not null default 2500 check (labor_rate_cents between 100 and 100000),
  crew_size_default smallint not null default 2 check (crew_size_default between 1 and 30),
  -- Supplies and equipment as a share of labor cost (basis points), a flat travel cost per clean,
  -- and a contingency share added to cost.
  materials_bps integer not null default 800 check (materials_bps between 0 and 10000),
  travel_cents bigint not null default 0 check (travel_cents >= 0),
  contingency_bps integer not null default 0 check (contingency_bps between 0 and 5000),
  minimum_project_cents bigint not null default 150000 check (minimum_project_cents >= 0),
  -- Rush work is priced at this multiple (12500 = 1.25x).
  rush_multiplier_bps integer not null default 12500 check (rush_multiplier_bps between 10000 and 30000),
  -- Margin = (price - cost) / price. The target is what a bid aims for; below the floor a bid can't be
  -- marked ready without a logged owner override. Both are placeholders to confirm.
  margin_target_bps integer not null default 3000 check (margin_target_bps between 0 and 9000),
  margin_floor_bps integer not null default 2000 check (margin_floor_bps between 0 and 9000),
  -- Value of the owner's own selling time per hour, used for "cost to win a project".
  selling_rate_cents integer not null default 4000 check (selling_rate_cents >= 0),
  confirmed_at timestamptz,
  updated_by uuid references public.profiles (user_id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint pricing_floor_le_target check (margin_floor_bps <= margin_target_bps)
);
insert into public.pricing_rules default values;
create index pricing_rules_updated_by_idx on public.pricing_rules (updated_by);

create table public.pricing_space_rates (
  space_type text primary key check (space_type in ('office', 'retail', 'medical', 'post_construction', 'warehouse', 'common_areas')),
  -- List price per 1,000 sq ft per clean, in cents (so $0.30/sq ft is 30000).
  rate_per_ksqft_cents bigint not null check (rate_per_ksqft_cents >= 0),
  -- Square feet one cleaner covers in an hour.
  productivity_sqft_per_hour integer not null check (productivity_sqft_per_hour between 50 and 20000)
);
insert into public.pricing_space_rates (space_type, rate_per_ksqft_cents, productivity_sqft_per_hour) values
  ('office', 30000, 1500), ('retail', 28000, 1600), ('medical', 45000, 1000),
  ('post_construction', 65000, 600), ('warehouse', 18000, 2500), ('common_areas', 25000, 1800);

alter table public.pricing_rules enable row level security;
alter table public.pricing_space_rates enable row level security;
create policy "pricing_rules: admin read" on public.pricing_rules for select to authenticated using ((select private.is_admin()));
create policy "pricing_space_rates: admin read" on public.pricing_space_rates for select to authenticated using ((select private.is_admin()));
revoke all on public.pricing_rules, public.pricing_space_rates from anon, authenticated;
grant select on public.pricing_rules, public.pricing_space_rates to authenticated;

create function private.save_pricing_rules(p_expected_version integer, p_rules jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  scalar_keys constant text[] := array['laborRateCents', 'crewSizeDefault', 'materialsBps', 'travelCents', 'contingencyBps', 'minimumProjectCents',
    'rushMultiplierBps', 'marginTargetBps', 'marginFloorBps', 'sellingRateCents'];
  v_old public.pricing_rules%rowtype;
  k text;
  s jsonb;
  v_new integer;
  v_seen text[] := '{}';
begin
  perform private.require_admin();
  if jsonb_typeof(p_rules) is distinct from 'object' or jsonb_typeof(p_rules -> 'spaceRates') is distinct from 'array' then
    raise exception 'check the pricing rules' using errcode = 'KC005';
  end if;
  for k in select jsonb_object_keys(p_rules) loop
    if k <> all (scalar_keys || array['spaceRates']) then
      raise exception 'unknown field: %', k using errcode = 'KC005';
    end if;
  end loop;
  foreach k in array scalar_keys loop
    if jsonb_typeof(p_rules -> k) is distinct from 'number' or (p_rules ->> k) !~ '^[0-9]+$' then
      raise exception '% must be a whole number', k using errcode = 'KC005';
    end if;
  end loop;
  select * into v_old from public.pricing_rules where id for update;
  if v_old.version is distinct from p_expected_version then
    raise exception 'the pricing rules were changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  -- Each space type exactly once.
  for s in select * from jsonb_array_elements(p_rules -> 'spaceRates') loop
    if jsonb_typeof(s) is distinct from 'object' or (s ->> 'spaceType') is null or (s ->> 'spaceType') = any (v_seen)
       or (s ->> 'ratePerKsqftCents') !~ '^[0-9]+$' or (s ->> 'productivitySqftPerHour') !~ '^[0-9]+$' then
      raise exception 'check the rate for each kind of space' using errcode = 'KC005';
    end if;
    v_seen := v_seen || (s ->> 'spaceType');
  end loop;
  if (select count(*) from public.pricing_space_rates) <> coalesce(array_length(v_seen, 1), 0)
     or exists (select 1 from public.pricing_space_rates r where r.space_type <> all (v_seen)) then
    raise exception 'give a rate for every kind of space' using errcode = 'KC005';
  end if;

  update public.pricing_rules set
    version = version + 1,
    labor_rate_cents = (p_rules ->> 'laborRateCents')::integer,
    crew_size_default = (p_rules ->> 'crewSizeDefault')::smallint,
    materials_bps = (p_rules ->> 'materialsBps')::integer,
    travel_cents = (p_rules ->> 'travelCents')::bigint,
    contingency_bps = (p_rules ->> 'contingencyBps')::integer,
    minimum_project_cents = (p_rules ->> 'minimumProjectCents')::bigint,
    rush_multiplier_bps = (p_rules ->> 'rushMultiplierBps')::integer,
    margin_target_bps = (p_rules ->> 'marginTargetBps')::integer,
    margin_floor_bps = (p_rules ->> 'marginFloorBps')::integer,
    selling_rate_cents = (p_rules ->> 'sellingRateCents')::integer,
    confirmed_at = now(),
    updated_by = (select auth.uid()),
    updated_at = now()
  where id
  returning version into v_new;

  for s in select * from jsonb_array_elements(p_rules -> 'spaceRates') loop
    update public.pricing_space_rates
    set rate_per_ksqft_cents = (s ->> 'ratePerKsqftCents')::bigint, productivity_sqft_per_hour = (s ->> 'productivitySqftPerHour')::integer
    where space_type = s ->> 'spaceType';
  end loop;

  perform private.log_finance('pricing', null, 'rules_saved', jsonb_build_object(
    'version', jsonb_build_array(v_old.version, v_new),
    'margin_target_bps', jsonb_build_array(v_old.margin_target_bps, (p_rules ->> 'marginTargetBps')::integer),
    'margin_floor_bps', jsonb_build_array(v_old.margin_floor_bps, (p_rules ->> 'marginFloorBps')::integer),
    'labor_rate_cents', jsonb_build_array(v_old.labor_rate_cents, (p_rules ->> 'laborRateCents')::integer)));
  return v_new;
end;
$$;

create function public.save_pricing_rules(p_expected_version integer, p_rules jsonb)
returns integer language sql volatile security invoker set search_path = ''
as $$ select private.save_pricing_rules(p_expected_version, p_rules) $$;

-- The rules as one JSON document, for the bid builder and the bid agent. Owner and admin only (RLS).
create function public.pricing_rules_snapshot()
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'version', r.version, 'confirmed', r.confirmed_at is not null,
    'laborRateCents', r.labor_rate_cents, 'crewSizeDefault', r.crew_size_default, 'materialsBps', r.materials_bps,
    'travelCents', r.travel_cents, 'contingencyBps', r.contingency_bps, 'minimumProjectCents', r.minimum_project_cents,
    'rushMultiplierBps', r.rush_multiplier_bps, 'marginTargetBps', r.margin_target_bps, 'marginFloorBps', r.margin_floor_bps,
    'sellingRateCents', r.selling_rate_cents,
    'spaceRates', coalesce((select jsonb_agg(jsonb_build_object('spaceType', s.space_type, 'ratePerKsqftCents', s.rate_per_ksqft_cents,
      'productivitySqftPerHour', s.productivity_sqft_per_hour) order by s.space_type) from public.pricing_space_rates s), '[]'::jsonb))
  from public.pricing_rules r where r.id
$$;

revoke execute on function private.save_pricing_rules(integer, jsonb) from public, anon;
grant execute on function private.save_pricing_rules(integer, jsonb) to authenticated;
revoke execute on function public.save_pricing_rules(integer, jsonb), public.pricing_rules_snapshot() from public, anon;
grant execute on function public.save_pricing_rules(integer, jsonb), public.pricing_rules_snapshot() to authenticated;
