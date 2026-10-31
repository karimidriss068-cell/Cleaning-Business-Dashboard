-- Leads & Pipeline: richer leads, and the functions that change them.
--
-- Stages keep their stored values; the app labels them New, Contacted,
-- Quote sent (quoted), Booked (won) and Lost. Every stage change, edit,
-- creation and conversion runs through a function in one transaction and
-- writes the lead's activity timeline. All functions run as the caller
-- (SECURITY INVOKER), so the staff-only RLS applies; they also refuse
-- anyone who isn't office staff up front. Errors (SQLSTATE): KC001 stale,
-- KC004 not allowed, KC005 bad input, KC010 duplicate contact.
-- external_id is reserved for a later CRM sync (nothing writes it yet).

create type public.lead_service_type as enum ('residential', 'recurring', 'move_out', 'commercial');

alter table public.leads
  add column service_type public.lead_service_type,
  add column owner_id uuid references public.profiles (user_id) on delete set null,
  add column next_follow_up_on date,
  add column stage_changed_at timestamptz not null default now(),
  add column closed_at timestamptz,
  add column external_id text;

alter table public.contacts add column customer_since timestamptz;

create unique index leads_external_id_key on public.leads (external_id) where external_id is not null;
create index leads_owner_id_idx on public.leads (owner_id);
create index leads_follow_up_idx on public.leads (next_follow_up_on) where stage in ('new', 'contacted', 'quoted');
create index leads_closed_at_idx on public.leads (closed_at) where closed_at is not null;

-- Sources become a fixed list. Existing demo values are folded into it.
update public.leads set source = case source
  when 'meta' then 'instagram'
  when 'google' then 'google'
  when 'referral' then 'referral'
  when 'thumbtack' then 'thumbtack'
  when 'instagram' then 'instagram'
  when 'walk_in' then 'walk_in'
  else 'other' end
where source is not null;
alter table public.leads add constraint leads_source_check
  check (source is null or source in ('referral', 'google', 'instagram', 'thumbtack', 'walk_in', 'other'));

-- Backfill the new columns from what's already there.
update public.leads l
set service_type = case
      when s.name ilike '%office%' then 'commercial'::public.lead_service_type
      when s.name ilike '%move%' then 'move_out'::public.lead_service_type
      when s.name ilike '%airbnb%' or s.name ilike '%recurring%' then 'recurring'::public.lead_service_type
      else 'residential'::public.lead_service_type end
from public.services s
where s.id = l.service_id and l.service_type is null;
update public.leads set service_type = 'residential' where service_type is null;
update public.leads set stage_changed_at = created_at;
update public.leads set closed_at = updated_at where stage in ('won', 'lost');

-- ---------------------------------------------------------------------------

-- US numbers to E.164 (+1XXXXXXXXXX), or null if it isn't one.
create function private.normalize_us_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^[2-9][0-9]{9}$' then '+1' || d
    when d ~ '^1[2-9][0-9]{9}$' then '+' || d
    else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;
revoke execute on function private.normalize_us_phone(text) from public, anon;
grant execute on function private.normalize_us_phone(text) to authenticated;

create function private.stage_label(s public.lead_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s when 'new' then 'New' when 'contacted' then 'Contacted' when 'quoted' then 'Quote sent' when 'won' then 'Booked' else 'Lost' end
$$;
revoke execute on function private.stage_label(public.lead_stage) from public, anon;
grant execute on function private.stage_label(public.lead_stage) to authenticated;

create function public.find_lead_duplicates(p_phone text, p_email text, p_exclude_contact uuid default null)
returns table (contact_id uuid, name text, phone text, email text, matched text[], open_lead_id uuid, open_lead_stage public.lead_stage)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    btrim(c.first_name || ' ' || coalesce(c.last_name, '')),
    c.phone,
    c.email,
    array_remove(array[
      case when v.np is not null and c.phone = v.np then 'phone' end,
      case when v.ne is not null and c.email = v.ne then 'email' end], null),
    (select l.id from public.leads l where l.contact_id = c.id and l.stage in ('new', 'contacted', 'quoted') order by l.created_at desc limit 1),
    (select l.stage from public.leads l where l.contact_id = c.id and l.stage in ('new', 'contacted', 'quoted') order by l.created_at desc limit 1)
  from public.contacts c
  cross join (select private.normalize_us_phone(p_phone) as np, nullif(lower(btrim(p_email)), '') as ne) v
  where private.is_staff()
    and ((v.np is not null and c.phone = v.np) or (v.ne is not null and c.email = v.ne))
    and (p_exclude_contact is null or c.id <> p_exclude_contact)
  order by c.created_at
  limit 5
$$;

create function public.create_lead(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_service_type public.lead_service_type,
  p_source text,
  p_borough public.borough default null,
  p_address_line1 text default null,
  p_zip text default null,
  p_notes text default null,
  p_owner_id uuid default null,
  p_next_follow_up_on date default null,
  p_contact_id uuid default null,
  p_allow_duplicate boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text := private.normalize_us_phone(p_phone);
  v_email text := nullif(lower(btrim(p_email)), '');
  v_contact uuid := p_contact_id;
  v_lead uuid;
  v_dups jsonb;
begin
  if not private.is_staff() then
    raise exception 'only office staff can add leads' using errcode = '42501';
  end if;
  if p_service_type is null then
    raise exception 'choose a service type' using errcode = 'KC005';
  end if;

  if v_contact is null then
    if btrim(coalesce(p_first_name, '')) = '' then
      raise exception 'a first name is required' using errcode = 'KC005';
    end if;
    if nullif(btrim(coalesce(p_phone, '')), '') is not null and v_phone is null then
      raise exception 'that phone number isn''t a valid US number' using errcode = 'KC005';
    end if;
    if v_phone is null and v_email is null then
      raise exception 'add a phone number or an email' using errcode = 'KC005';
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'that email address isn''t valid' using errcode = 'KC005';
    end if;
    if not p_allow_duplicate then
      select jsonb_agg(to_jsonb(d)) into v_dups from public.find_lead_duplicates(v_phone, v_email) d;
      if v_dups is not null then
        raise exception 'this looks like an existing contact' using errcode = 'KC010', detail = v_dups::text;
      end if;
    end if;
    insert into public.contacts (type, first_name, last_name, phone, email, address_line1, zip, borough, source)
    values (
      case when p_service_type = 'commercial' then 'commercial'::public.contact_type else 'residential'::public.contact_type end,
      btrim(p_first_name), nullif(btrim(coalesce(p_last_name, '')), ''), v_phone, v_email,
      nullif(btrim(coalesce(p_address_line1, '')), ''), nullif(btrim(coalesce(p_zip, '')), ''), p_borough, p_source)
    returning id into v_contact;
  elsif not exists (select 1 from public.contacts where id = v_contact) then
    raise exception 'unknown contact' using errcode = 'KC005';
  end if;

  insert into public.leads (contact_id, service_type, source, notes, owner_id, next_follow_up_on)
  values (
    v_contact, p_service_type, p_source, nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_owner_id, (select auth.uid())),
    coalesce(p_next_follow_up_on, ((now() at time zone 'America/New_York')::date + 1)))
  returning id into v_lead;

  insert into public.activities (type, subject, body, lead_id, contact_id, actor_user_id)
  values ('note', 'Lead created', format('Service: %s. Source: %s.', p_service_type, coalesce(p_source, 'not set')), v_lead, v_contact, (select auth.uid()));

  return jsonb_build_object('lead_id', v_lead, 'contact_id', v_contact);
end;
$$;

create function public.move_lead_stage(
  p_lead_id uuid,
  p_expected_updated_at timestamptz,
  p_stage public.lead_stage,
  p_lost_reason text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_result timestamptz;
  v_reason text := nullif(btrim(coalesce(p_lost_reason, '')), '');
  v_quote uuid;
begin
  if not private.is_staff() then
    raise exception 'only office staff can move leads' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead not found' using errcode = 'KC005';
  end if;
  if v_lead.updated_at is distinct from p_expected_updated_at then
    raise exception 'this lead was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if v_lead.stage = p_stage then
    return v_lead.updated_at;
  end if;
  if p_stage = 'lost' and v_reason is null then
    raise exception 'a lost reason is required' using errcode = 'KC005';
  end if;

  update public.leads
  set stage = p_stage,
      stage_changed_at = now(),
      closed_at = case when p_stage in ('won', 'lost') then now() else null end,
      lost_reason = case when p_stage = 'lost' then v_reason else null end,
      first_response_at = case when first_response_at is null and p_stage in ('contacted', 'quoted', 'won') then now() else first_response_at end,
      next_follow_up_on = case when p_stage in ('won', 'lost') then null else next_follow_up_on end
  where id = p_lead_id
  returning updated_at into v_result;

  -- Keep the lead's quote in step with the stage.
  select id into v_quote from public.quotes where lead_id = p_lead_id order by created_at desc limit 1;
  if v_quote is not null then
    if p_stage = 'quoted' then
      update public.quotes set status = 'sent', sent_at = coalesce(sent_at, now()), declined_at = null, accepted_at = null where id = v_quote and status in ('draft', 'sent', 'declined', 'accepted');
    elsif p_stage = 'won' then
      update public.quotes set status = 'accepted', accepted_at = now(), declined_at = null, sent_at = coalesce(sent_at, now()) where id = v_quote and status in ('draft', 'sent');
    elsif p_stage = 'lost' then
      update public.quotes set status = 'declined', declined_at = now() where id = v_quote and status in ('draft', 'sent');
    elsif v_lead.stage = 'won' then
      update public.quotes set status = 'sent', accepted_at = null where id = v_quote and status = 'accepted';
    elsif v_lead.stage = 'lost' then
      update public.quotes set status = case when sent_at is not null then 'sent'::public.quote_status else 'draft'::public.quote_status end, declined_at = null where id = v_quote and status = 'declined';
    end if;
  end if;

  insert into public.activities (type, subject, body, lead_id, contact_id, actor_user_id)
  values (
    'status_change',
    format('Stage: %s -> %s', private.stage_label(v_lead.stage), private.stage_label(p_stage)),
    case when p_stage = 'lost' then 'Reason: ' || v_reason else null end,
    p_lead_id, v_lead.contact_id, (select auth.uid()));

  return v_result;
end;
$$;

create function public.update_lead(p_lead_id uuid, p_expected_updated_at timestamptz, p_patch jsonb)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lead_keys constant text[] := array['service_type', 'source', 'owner_id', 'next_follow_up_on', 'notes', 'requested_date', 'bedrooms', 'bathrooms', 'sqft'];
  contact_keys constant text[] := array['first_name', 'last_name', 'phone', 'email', 'address_line1', 'address_line2', 'borough', 'zip'];
  v_lead public.leads%rowtype;
  v_contact public.contacts%rowtype;
  v_after_lead jsonb;
  v_after_contact jsonb;
  v_result timestamptz;
  v_changed text[] := '{}';
  k text;
begin
  if not private.is_staff() then
    raise exception 'only office staff can edit leads' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'nothing to update' using errcode = 'KC005';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k <> all (lead_keys || contact_keys) then
      raise exception 'unknown field: %', k using errcode = 'KC005';
    end if;
  end loop;
  if p_patch ? 'phone' and nullif(btrim(coalesce(p_patch->>'phone', '')), '') is not null and private.normalize_us_phone(p_patch->>'phone') is null then
    raise exception 'that phone number isn''t a valid US number' using errcode = 'KC005';
  end if;
  if p_patch ? 'first_name' and btrim(coalesce(p_patch->>'first_name', '')) = '' then
    raise exception 'a first name is required' using errcode = 'KC005';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead not found' using errcode = 'KC005';
  end if;
  if v_lead.updated_at is distinct from p_expected_updated_at then
    raise exception 'this lead was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  select * into v_contact from public.contacts where id = v_lead.contact_id for update;

  update public.contacts set
    first_name = case when p_patch ? 'first_name' then btrim(p_patch->>'first_name') else first_name end,
    last_name = case when p_patch ? 'last_name' then nullif(btrim(coalesce(p_patch->>'last_name', '')), '') else last_name end,
    phone = case when p_patch ? 'phone' then private.normalize_us_phone(p_patch->>'phone') else phone end,
    email = case when p_patch ? 'email' then nullif(lower(btrim(coalesce(p_patch->>'email', ''))), '') else email end,
    address_line1 = case when p_patch ? 'address_line1' then nullif(btrim(coalesce(p_patch->>'address_line1', '')), '') else address_line1 end,
    address_line2 = case when p_patch ? 'address_line2' then nullif(btrim(coalesce(p_patch->>'address_line2', '')), '') else address_line2 end,
    borough = case when p_patch ? 'borough' then (p_patch->>'borough')::public.borough else borough end,
    zip = case when p_patch ? 'zip' then nullif(btrim(coalesce(p_patch->>'zip', '')), '') else zip end
  where id = v_contact.id
  returning to_jsonb(contacts.*) into v_after_contact;

  update public.leads set
    service_type = case when p_patch ? 'service_type' then (p_patch->>'service_type')::public.lead_service_type else service_type end,
    source = case when p_patch ? 'source' then p_patch->>'source' else source end,
    owner_id = case when p_patch ? 'owner_id' then (p_patch->>'owner_id')::uuid else owner_id end,
    next_follow_up_on = case when p_patch ? 'next_follow_up_on' then (p_patch->>'next_follow_up_on')::date else next_follow_up_on end,
    notes = case when p_patch ? 'notes' then nullif(btrim(coalesce(p_patch->>'notes', '')), '') else notes end,
    requested_date = case when p_patch ? 'requested_date' then (p_patch->>'requested_date')::date else requested_date end,
    bedrooms = case when p_patch ? 'bedrooms' then (p_patch->>'bedrooms')::smallint else bedrooms end,
    bathrooms = case when p_patch ? 'bathrooms' then (p_patch->>'bathrooms')::numeric else bathrooms end,
    sqft = case when p_patch ? 'sqft' then (p_patch->>'sqft')::integer else sqft end
  where id = p_lead_id
  returning to_jsonb(leads.*), updated_at into v_after_lead, v_result;

  foreach k in array lead_keys loop
    if p_patch ? k and (to_jsonb(v_lead) -> k) is distinct from (v_after_lead -> k) then v_changed := v_changed || k; end if;
  end loop;
  foreach k in array contact_keys loop
    if p_patch ? k and (to_jsonb(v_contact) -> k) is distinct from (v_after_contact -> k) then v_changed := v_changed || k; end if;
  end loop;

  if array_length(v_changed, 1) > 0 then
    -- Touch the lead so concurrent editors notice contact-only edits too.
    update public.leads set updated_at = now() where id = p_lead_id returning updated_at into v_result;
    insert into public.activities (type, subject, body, lead_id, contact_id, actor_user_id)
    values ('note', 'Lead updated', 'Changed: ' || array_to_string(array(select replace(x, '_', ' ') from unnest(v_changed) x), ', '), p_lead_id, v_lead.contact_id, (select auth.uid()));
  end if;
  return v_result;
end;
$$;

create function public.convert_lead(p_lead_id uuid, p_expected_updated_at timestamptz, p_company_name text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_contact public.contacts%rowtype;
  v_service public.services%rowtype;
  v_account uuid;
  v_property uuid;
  v_quote uuid;
  v_number bigint;
  v_commercial boolean;
  v_existing public.quotes%rowtype;
begin
  if not private.is_staff() then
    raise exception 'only office staff can convert leads' using errcode = '42501';
  end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'lead not found' using errcode = 'KC005';
  end if;
  select * into v_contact from public.contacts where id = v_lead.contact_id for update;

  -- Converting twice returns what the first conversion made.
  select * into v_existing from public.quotes where lead_id = p_lead_id order by created_at limit 1;
  if found then
    return jsonb_build_object('contact_id', v_contact.id, 'account_id', v_contact.account_id, 'quote_id', v_existing.id, 'quote_number', v_existing.quote_number, 'already', true);
  end if;

  if v_lead.updated_at is distinct from p_expected_updated_at then
    raise exception 'this lead was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if v_lead.stage = 'lost' then
    raise exception 'reopen this lead before converting it' using errcode = 'KC004';
  end if;

  v_commercial := v_lead.service_type = 'commercial' or v_contact.type = 'commercial';
  v_account := v_contact.account_id;
  if v_commercial and v_account is null then
    insert into public.accounts (name, status, primary_contact_id)
    values (coalesce(nullif(btrim(coalesce(p_company_name, '')), ''), btrim(v_contact.first_name || ' ' || coalesce(v_contact.last_name, ''))), 'prospect', v_contact.id)
    returning id into v_account;
  end if;

  update public.contacts
  set customer_since = coalesce(customer_since, now()), account_id = v_account,
      type = case when v_commercial then 'commercial'::public.contact_type else type end
  where id = v_contact.id;

  select id into v_property from public.properties
  where (not v_commercial and contact_id = v_contact.id) or (v_commercial and account_id = v_account) limit 1;
  if v_property is null and v_contact.address_line1 is not null and v_contact.zip is not null and v_contact.borough is not null then
    insert into public.properties (contact_id, account_id, label, address_line1, address_line2, zip, borough, bedrooms, bathrooms, sqft)
    values (case when v_commercial then null else v_contact.id end, case when v_commercial then v_account else null end,
            case when v_commercial then 'Main site' else 'Home' end,
            v_contact.address_line1, v_contact.address_line2, v_contact.zip, v_contact.borough, v_lead.bedrooms, v_lead.bathrooms, v_lead.sqft)
    returning id into v_property;
  end if;

  insert into public.quotes (lead_id, contact_id, account_id, property_id, created_by)
  values (p_lead_id, v_contact.id, v_account, v_property, (select auth.uid()))
  returning id, quote_number into v_quote, v_number;

  if v_lead.service_id is not null then
    select * into v_service from public.services where id = v_lead.service_id;
  end if;
  insert into public.quote_items (quote_id, service_id, description, quantity, unit_price_cents)
  values (v_quote, v_service.id, coalesce(v_service.name, initcap(replace(v_lead.service_type::text, '_', ' ')) || ' cleaning'), 1, coalesce(v_service.base_price_cents, 0));

  -- Opening a quote means we've reached out: New becomes Contacted.
  update public.leads
  set stage = case when stage = 'new' then 'contacted' else stage end,
      stage_changed_at = case when stage = 'new' then now() else stage_changed_at end,
      first_response_at = coalesce(first_response_at, now())
  where id = p_lead_id;

  insert into public.activities (type, subject, body, lead_id, contact_id, actor_user_id)
  values ('note', 'Converted to customer', format('Customer created%s. Quote #%s opened as a draft.', case when v_commercial then ' with a company account' else '' end, v_number), p_lead_id, v_contact.id, (select auth.uid()));

  return jsonb_build_object('contact_id', v_contact.id, 'account_id', v_account, 'property_id', v_property, 'quote_id', v_quote, 'quote_number', v_number, 'already', false);
end;
$$;

create function public.lead_conversion_by_source(p_from date, p_to date)
returns table (source text, leads bigint, booked bigint, lost bigint, open bigint, conversion_bps integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(l.source, 'other'),
    count(*),
    count(*) filter (where l.stage = 'won'),
    count(*) filter (where l.stage = 'lost'),
    count(*) filter (where l.stage in ('new', 'contacted', 'quoted')),
    round(10000.0 * count(*) filter (where l.stage = 'won') / nullif(count(*), 0))::integer
  from public.leads l
  where private.is_staff()
    and (l.created_at at time zone 'America/New_York')::date between p_from and p_to
  group by coalesce(l.source, 'other')
  order by count(*) desc
$$;

revoke execute on function
  public.find_lead_duplicates(text, text, uuid),
  public.create_lead(text, text, text, text, public.lead_service_type, text, public.borough, text, text, text, uuid, date, uuid, boolean),
  public.move_lead_stage(uuid, timestamptz, public.lead_stage, text),
  public.update_lead(uuid, timestamptz, jsonb),
  public.convert_lead(uuid, timestamptz, text),
  public.lead_conversion_by_source(date, date)
from public, anon;
grant execute on function
  public.find_lead_duplicates(text, text, uuid),
  public.create_lead(text, text, text, text, public.lead_service_type, text, public.borough, text, text, text, uuid, date, uuid, boolean),
  public.move_lead_stage(uuid, timestamptz, public.lead_stage, text),
  public.update_lead(uuid, timestamptz, jsonb),
  public.convert_lead(uuid, timestamptz, text),
  public.lead_conversion_by_source(date, date)
to authenticated;
