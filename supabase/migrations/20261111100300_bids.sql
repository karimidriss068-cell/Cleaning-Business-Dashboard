-- Bids: a bid belongs to an opportunity (lead) and a company account, and is saved as numbered, immutable
-- versions. Each version keeps the inputs, the cost lines, the price, the margin it works out to, and the
-- pricing rules (and their version) it was priced from. The database sums the cost lines and works out the
-- margin itself; below the pricing floor a version needs a reason, which is stored with it. Owner and admin
-- only: bids carry cost and margin. Saved only through functions, each logged (finance_log entity 'bid').

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  bid_number bigint generated always as identity unique,
  lead_id uuid not null references public.leads (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'won', 'lost', 'expired')),
  current_version integer not null default 0 check (current_version >= 0),
  valid_until date,
  sent_at timestamptz,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bids_lead_id_idx on public.bids (lead_id);
create index bids_account_id_idx on public.bids (account_id);
create index bids_contact_id_idx on public.bids (contact_id);
create index bids_created_by_idx on public.bids (created_by);
create trigger bids_set_updated_at before update on public.bids for each row execute function private.set_updated_at();

create table public.bid_versions (
  id uuid primary key default gen_random_uuid(),
  bid_id uuid not null references public.bids (id) on delete cascade,
  version integer not null check (version >= 1),
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  cost_lines jsonb not null check (jsonb_typeof(cost_lines) = 'array'),
  cost_cents bigint not null check (cost_cents >= 0),
  price_cents bigint not null check (price_cents > 0),
  -- (price - cost) / price in basis points; negative when the bid loses money.
  margin_bps integer not null,
  rules_version integer not null,
  rules_snapshot jsonb not null,
  floor_override_reason text check (floor_override_reason is null or length(btrim(floor_override_reason)) >= 3),
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bid_versions_bid_version_key unique (bid_id, version)
);
create index bid_versions_created_by_idx on public.bid_versions (created_by);

alter table public.bids enable row level security;
alter table public.bid_versions enable row level security;
create policy "bids: admin read" on public.bids for select to authenticated using ((select private.is_admin()));
create policy "bid_versions: admin read" on public.bid_versions for select to authenticated using ((select private.is_admin()));
revoke all on public.bids, public.bid_versions from anon, authenticated;
grant select on public.bids, public.bid_versions to authenticated;

create function private.save_bid_version(
  p_title text,
  p_inputs jsonb,
  p_cost_lines jsonb,
  p_price_cents bigint,
  p_expected_rules_version integer,
  p_bid_id uuid default null,
  p_lead_id uuid default null,
  p_company_name text default null,
  p_expected_version integer default null,
  p_floor_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_reason text := nullif(btrim(coalesce(p_floor_override_reason, '')), '');
  v_rules public.pricing_rules%rowtype;
  v_bid public.bids%rowtype;
  v_lead public.leads%rowtype;
  v_contact public.contacts%rowtype;
  v_account uuid;
  v_line jsonb;
  v_cost bigint := 0;
  v_margin integer;
  v_version integer;
begin
  perform private.require_admin();
  if length(v_title) not between 1 and 160 or jsonb_typeof(p_inputs) is distinct from 'object'
     or jsonb_typeof(p_cost_lines) is distinct from 'array' or jsonb_array_length(p_cost_lines) = 0 or p_price_cents is null or p_price_cents <= 0 then
    raise exception 'check the bid: a title, at least one cost line and a price are required' using errcode = 'KC005';
  end if;
  for v_line in select * from jsonb_array_elements(p_cost_lines) loop
    if jsonb_typeof(v_line) is distinct from 'object' or length(btrim(coalesce(v_line ->> 'label', ''))) not between 1 and 120
       or coalesce(v_line ->> 'cents', '') !~ '^[0-9]{1,12}$' then
      raise exception 'check the cost lines' using errcode = 'KC005';
    end if;
    v_cost := v_cost + (v_line ->> 'cents')::bigint;
  end loop;

  select * into v_rules from public.pricing_rules where id;
  if v_rules.version is distinct from p_expected_rules_version then
    raise exception 'the pricing rules changed while you were working; reload the bid to use the new numbers' using errcode = 'KC001';
  end if;
  v_margin := ((p_price_cents - v_cost) * 10000 / p_price_cents)::integer;
  if v_margin < v_rules.margin_floor_bps and v_reason is null then
    raise exception 'this price is below your margin floor; raise it or add a reason to keep it' using errcode = 'KC004';
  end if;

  if p_bid_id is null then
    if p_lead_id is null then
      raise exception 'a bid belongs to an opportunity' using errcode = 'KC005';
    end if;
    select * into v_lead from public.leads where id = p_lead_id for update;
    if not found then
      raise exception 'opportunity not found' using errcode = 'KC005';
    end if;
    if v_lead.stage = 'lost' then
      raise exception 'reopen this opportunity before bidding on it' using errcode = 'KC004';
    end if;
    select * into v_contact from public.contacts where id = v_lead.contact_id for update;
    v_account := v_lead.account_id;
    if v_account is null then
      v_account := v_contact.account_id;
    end if;
    if v_account is null then
      insert into public.accounts (name, status, primary_contact_id)
      values (coalesce(nullif(btrim(coalesce(p_company_name, '')), ''), btrim(v_contact.first_name || ' ' || coalesce(v_contact.last_name, ''))), 'prospect', v_contact.id)
      returning id into v_account;
    end if;
    update public.contacts set account_id = v_account, type = 'commercial' where id = v_contact.id;
    update public.leads set account_id = v_account where id = v_lead.id;
    insert into public.bids (lead_id, account_id, contact_id, title, created_by)
    values (v_lead.id, v_account, v_contact.id, v_title, (select auth.uid()))
    returning * into v_bid;
    v_version := 1;
  else
    select * into v_bid from public.bids where id = p_bid_id for update;
    if not found then
      raise exception 'bid not found' using errcode = 'KC005';
    end if;
    if v_bid.current_version is distinct from p_expected_version then
      raise exception 'this bid was changed by someone else; reload and try again' using errcode = 'KC001';
    end if;
    if v_bid.status in ('won', 'lost', 'expired') then
      raise exception 'a closed bid can''t be edited; start a new bid' using errcode = 'KC004';
    end if;
    v_version := v_bid.current_version + 1;
  end if;

  insert into public.bid_versions (bid_id, version, inputs, cost_lines, cost_cents, price_cents, margin_bps, rules_version, rules_snapshot, floor_override_reason, created_by)
  values (v_bid.id, v_version, p_inputs, p_cost_lines, v_cost, p_price_cents, v_margin, v_rules.version, public.pricing_rules_snapshot(), v_reason, (select auth.uid()));
  -- Editing a bid that already went out makes a revision that hasn't been sent yet.
  update public.bids set current_version = v_version, title = v_title, status = 'draft', valid_until = case when status = 'sent' then null else valid_until end
  where id = v_bid.id;
  insert into public.activities (type, subject, body, lead_id, contact_id, actor_user_id)
  values ('note', format('Bid #%s version %s saved', v_bid.bid_number, v_version), format('Price %s, margin %s%%', to_char(p_price_cents / 100.0, 'FM$999,999,990.00'), round(v_margin / 100.0, 1)),
          v_bid.lead_id, v_bid.contact_id, (select auth.uid()));
  perform private.log_finance('bid', v_bid.id, case when v_version = 1 then 'bid_created' else 'version_saved' end,
    jsonb_build_object('version', v_version, 'price_cents', p_price_cents, 'cost_cents', v_cost, 'margin_bps', v_margin, 'rules_version', v_rules.version, 'below_floor_reason', v_reason));
  return jsonb_build_object('bid_id', v_bid.id, 'bid_number', v_bid.bid_number, 'version', v_version, 'margin_bps', v_margin);
end;
$$;

create function private.set_bid_status(p_bid_id uuid, p_status text, p_expected_updated_at timestamptz, p_valid_until date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids%rowtype;
  v_ver public.bid_versions%rowtype;
  v_lead public.leads%rowtype;
  v_valid date := p_valid_until;
begin
  perform private.require_admin();
  select * into v_bid from public.bids where id = p_bid_id for update;
  if not found then
    raise exception 'bid not found' using errcode = 'KC005';
  end if;
  if v_bid.updated_at is distinct from p_expected_updated_at then
    raise exception 'this bid was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if v_bid.current_version = 0 then
    raise exception 'save the bid first' using errcode = 'KC004';
  end if;
  select * into v_ver from public.bid_versions where bid_id = v_bid.id and version = v_bid.current_version;

  if p_status = 'ready' and v_bid.status = 'draft' then
    if v_ver.margin_bps < (v_ver.rules_snapshot ->> 'marginFloorBps')::integer and v_ver.floor_override_reason is null then
      raise exception 'this price is below your margin floor; save a version with a reason first' using errcode = 'KC004';
    end if;
    update public.bids set status = 'ready' where id = v_bid.id;
  elsif p_status = 'draft' and v_bid.status = 'ready' then
    update public.bids set status = 'draft' where id = v_bid.id;
  elsif p_status = 'sent' and v_bid.status = 'ready' then
    select * into v_lead from public.leads where id = v_bid.lead_id for update;
    if v_lead.stage in ('won', 'lost') then
      raise exception 'reopen the opportunity before sending a bid' using errcode = 'KC004';
    end if;
    v_valid := coalesce(v_valid, ((now() at time zone 'America/New_York')::date + 30));
    if v_valid < (now() at time zone 'America/New_York')::date then
      raise exception 'the bid can''t expire before today' using errcode = 'KC005';
    end if;
    update public.bids set status = 'sent', sent_at = now(), valid_until = v_valid where id = v_bid.id;
    -- The opportunity carries the bid's value, then moves to Bid sent (which also writes its timeline).
    update public.leads set expected_value_cents = v_ver.price_cents where id = v_lead.id and expected_value_cents is distinct from v_ver.price_cents;
    if v_lead.stage <> 'quoted' then
      perform public.move_lead_stage(v_lead.id, (select updated_at from public.leads where id = v_lead.id), 'quoted');
    end if;
  else
    raise exception 'a % bid can''t be set to %', v_bid.status, p_status using errcode = 'KC004';
  end if;
  perform private.log_finance('bid', v_bid.id, 'status_' || p_status, jsonb_build_object('from', v_bid.status, 'version', v_bid.current_version, 'valid_until', v_valid));
  return jsonb_build_object('updated_at', (select updated_at from public.bids where id = v_bid.id), 'status', p_status);
end;
$$;

create function public.save_bid_version(
  p_title text, p_inputs jsonb, p_cost_lines jsonb, p_price_cents bigint, p_expected_rules_version integer,
  p_bid_id uuid default null, p_lead_id uuid default null, p_company_name text default null,
  p_expected_version integer default null, p_floor_override_reason text default null)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.save_bid_version(p_title, p_inputs, p_cost_lines, p_price_cents, p_expected_rules_version, p_bid_id, p_lead_id, p_company_name, p_expected_version, p_floor_override_reason) $$;
create function public.set_bid_status(p_bid_id uuid, p_status text, p_expected_updated_at timestamptz, p_valid_until date default null)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.set_bid_status(p_bid_id, p_status, p_expected_updated_at, p_valid_until) $$;

revoke execute on function
  private.save_bid_version(text, jsonb, jsonb, bigint, integer, uuid, uuid, text, integer, text),
  private.set_bid_status(uuid, text, timestamptz, date),
  public.save_bid_version(text, jsonb, jsonb, bigint, integer, uuid, uuid, text, integer, text),
  public.set_bid_status(uuid, text, timestamptz, date) from public, anon;
grant execute on function
  private.save_bid_version(text, jsonb, jsonb, bigint, integer, uuid, uuid, text, integer, text),
  private.set_bid_status(uuid, text, timestamptz, date),
  public.save_bid_version(text, jsonb, jsonb, bigint, integer, uuid, uuid, text, integer, text),
  public.set_bid_status(uuid, text, timestamptz, date) to authenticated;
