-- Public lead intake (the embeddable form at /lead-form, POST /api/public/leads).
--
-- The website form is anonymous, so it cannot call create_lead (staff only). Instead the
-- body of create_lead moves into private.create_lead_core, which both the staff wrapper and
-- the service-role-only intake_lead call, so duplicate detection, validation, the contact
-- and lead inserts and the timeline stay one code path.
--
-- Text consent is stored as evidence (consent_records: when, where, the exact wording shown)
-- and only switches contacts.sms_consent on for a brand-new contact; an existing contact is
-- never flipped by an anonymous form, a person on staff confirms it. A duplicate looks the
-- same to the visitor as a new lead, so the form can't be used to look people up.
-- The rate limiter is a small table; only the server (service role) touches it.

-- 1. Duplicate matching without the staff gate (the public wrapper keeps it).
create function private.lead_duplicates(p_phone text, p_email text, p_exclude_contact uuid default null)
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
  where ((v.np is not null and c.phone = v.np) or (v.ne is not null and c.email = v.ne))
    and (p_exclude_contact is null or c.id <> p_exclude_contact)
  order by c.created_at
  limit 5
$$;
revoke execute on function private.lead_duplicates(text, text, uuid) from public, anon;
grant execute on function private.lead_duplicates(text, text, uuid) to authenticated, service_role;

create or replace function public.find_lead_duplicates(p_phone text, p_email text, p_exclude_contact uuid default null)
returns table (contact_id uuid, name text, phone text, email text, matched text[], open_lead_id uuid, open_lead_stage public.lead_stage)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.lead_duplicates(p_phone, p_email, p_exclude_contact) where private.is_staff()
$$;

-- 2. The create_lead body, with the actor passed in (null for the public form).
create function private.create_lead_core(
  p_actor uuid,
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
  p_allow_duplicate boolean default false,
  p_utm jsonb default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text := private.normalize_us_phone(p_phone);
  v_email text := nullif(lower(btrim(p_email)), '');
  v_utm jsonb := coalesce(p_utm, '{}');
  v_contact uuid := p_contact_id;
  v_lead uuid;
  v_dups jsonb;
  v_campaign uuid;
begin
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
      select jsonb_agg(to_jsonb(d)) into v_dups from private.lead_duplicates(v_phone, v_email) d;
      if v_dups is not null then
        raise exception 'this looks like an existing contact' using errcode = 'KC010', detail = v_dups::text;
      end if;
    end if;
    insert into public.contacts (type, first_name, last_name, phone, email, address_line1, zip, borough, source,
                                 utm_source, utm_medium, utm_campaign, utm_term, utm_content)
    values (
      case when p_service_type = 'commercial' then 'commercial'::public.contact_type else 'residential'::public.contact_type end,
      btrim(p_first_name), nullif(btrim(coalesce(p_last_name, '')), ''), v_phone, v_email,
      nullif(btrim(coalesce(p_address_line1, '')), ''), nullif(btrim(coalesce(p_zip, '')), ''), p_borough, p_source,
      left(v_utm ->> 'source', 120), left(v_utm ->> 'medium', 120), left(v_utm ->> 'campaign', 200),
      left(v_utm ->> 'term', 200), left(v_utm ->> 'content', 200))
    returning id into v_contact;
  elsif not exists (select 1 from public.contacts where id = v_contact) then
    raise exception 'unknown contact' using errcode = 'KC005';
  end if;

  select id into v_campaign from public.marketing_campaigns
  where lower(name) = lower(btrim(coalesce(v_utm ->> 'campaign', ''))) and id::text not like '5eed0000-%' limit 1;

  insert into public.leads (contact_id, service_type, source, notes, owner_id, next_follow_up_on, campaign_id)
  values (
    v_contact, p_service_type, p_source, nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_owner_id, p_actor),
    coalesce(p_next_follow_up_on, ((now() at time zone 'America/New_York')::date + 1)),
    v_campaign)
  returning id into v_lead;

  insert into public.activities (type, subject, body, lead_id, contact_id, actor_user_id)
  values ('note', 'Lead created', format('Service: %s. Source: %s.', p_service_type, coalesce(p_source, 'not set')), v_lead, v_contact, p_actor);

  return jsonb_build_object('lead_id', v_lead, 'contact_id', v_contact);
end;
$$;
revoke execute on function private.create_lead_core(uuid, text, text, text, text, public.lead_service_type, text, public.borough, text, text, text, uuid, date, uuid, boolean, jsonb) from public, anon;
grant execute on function private.create_lead_core(uuid, text, text, text, text, public.lead_service_type, text, public.borough, text, text, text, uuid, date, uuid, boolean, jsonb) to authenticated, service_role;

create or replace function public.create_lead(
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
begin
  if not private.is_staff() then
    raise exception 'only office staff can add leads' using errcode = '42501';
  end if;
  return private.create_lead_core((select auth.uid()), p_first_name, p_last_name, p_phone, p_email, p_service_type, p_source,
    p_borough, p_address_line1, p_zip, p_notes, p_owner_id, p_next_follow_up_on, p_contact_id, p_allow_duplicate);
end;
$$;

-- 3. Consent evidence: one row per tick of the box, never edited.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  channel text not null default 'sms' check (channel = 'sms'),
  granted_at timestamptz not null default now(),
  source text not null check (source in ('web_form')),
  wording_version text not null check (length(wording_version) between 1 and 40),
  wording text not null check (length(wording) between 20 and 1000),
  page text check (page is null or length(page) <= 300),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  -- false when the contact already existed: staff confirm before texts are allowed.
  applied boolean not null
);
create index consent_records_contact_idx on public.consent_records (contact_id, granted_at desc);
alter table public.consent_records enable row level security;
revoke all on public.consent_records from anon;
revoke insert, update, delete on public.consent_records from authenticated;
create policy "consent_records: staff read" on public.consent_records for select to authenticated using ((select private.is_staff()));

-- 4. Rate limiter (server only).
create table public.intake_hits (
  id bigint generated always as identity primary key,
  key text not null check (length(key) <= 80),
  created_at timestamptz not null default now()
);
create index intake_hits_key_idx on public.intake_hits (key, created_at);
alter table public.intake_hits enable row level security;
revoke all on public.intake_hits from anon, authenticated;

-- Records a hit and says whether it is within the limit. The lock makes concurrent
-- requests with the same key count one at a time.
create function public.intake_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'bad rate limit arguments' using errcode = 'KC005';
  end if;
  perform pg_advisory_xact_lock(hashtext('intake:' || p_key));
  select count(*) into v_count from public.intake_hits
  where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.intake_hits (key) values (p_key);
  delete from public.intake_hits where created_at < now() - interval '2 days';
  return true;
end;
$$;

-- 5. The intake itself.
create function public.intake_lead(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_service_type public.lead_service_type,
  p_borough public.borough default null,
  p_utm jsonb default '{}',
  p_page text default null,
  p_consent boolean default false,
  p_consent_wording text default null,
  p_consent_version text default null,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.normalize_us_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_utm jsonb := coalesce(p_utm, '{}');
  v_source text := private.ghl_source(v_utm ->> 'source');
  v_dup record;
  v_res jsonb;
  v_contact uuid;
  v_lead uuid;
  v_duplicate boolean := false;
  v_new_contact boolean := false;
  v_applied boolean := false;
begin
  -- Two simultaneous submissions for one person queue up here and the second sees the first.
  perform pg_advisory_xact_lock(hashtext('intake-person:' || coalesce(v_phone, v_email, 'none')));

  select * into v_dup from private.lead_duplicates(v_phone, v_email) limit 1;
  if v_dup.contact_id is not null then
    v_duplicate := true;
    v_contact := v_dup.contact_id;
    v_lead := v_dup.open_lead_id;
    if v_lead is null then
      v_res := private.create_lead_core(null, p_first_name, p_last_name, p_phone, p_email, p_service_type, v_source,
        p_borough, null, null, null, null, ((now() at time zone 'America/New_York')::date), v_contact, true, v_utm);
      v_lead := (v_res ->> 'lead_id')::uuid;
      insert into public.activities (type, subject, body, lead_id, contact_id)
      values ('call', 'Call this lead now', 'Returning contact sent the website form again. Speed to lead matters.', v_lead, v_contact);
    else
      insert into public.activities (type, subject, body, lead_id, contact_id)
      values ('note', 'Sent the website form again', format('Service: %s. Page: %s.', p_service_type, coalesce(left(p_page, 300), 'unknown')), v_lead, v_contact);
    end if;
  else
    v_res := private.create_lead_core(null, p_first_name, p_last_name, p_phone, p_email, p_service_type, v_source,
      p_borough, null, null, null, null, ((now() at time zone 'America/New_York')::date), null, true, v_utm);
    v_contact := (v_res ->> 'contact_id')::uuid;
    v_lead := (v_res ->> 'lead_id')::uuid;
    v_new_contact := true;
    insert into public.activities (type, subject, body, lead_id, contact_id)
    values ('call', 'Call this lead now', format('New lead from the website form. Page: %s.', coalesce(left(p_page, 300), 'unknown')), v_lead, v_contact);
  end if;

  -- Texting consent: the evidence is always kept; the flag is switched on only for a new
  -- contact with a phone that has not replied STOP.
  if p_consent then
    if p_consent_wording is null or p_consent_version is null then
      raise exception 'the consent wording is required' using errcode = 'KC005';
    end if;
    select phone into v_phone from public.contacts where id = v_contact;
    v_applied := v_new_contact and v_phone is not null
      and not exists (select 1 from public.opt_outs where channel = 'sms' and value = v_phone);
    insert into public.consent_records (contact_id, source, wording_version, wording, page, ip_hash, applied)
    values (v_contact, 'web_form', p_consent_version, p_consent_wording, left(p_page, 300), p_ip_hash, v_applied);
    if v_applied then
      update public.contacts set sms_consent = true, sms_consent_at = now(), sms_consent_source = 'web_form'
      where id = v_contact;
    end if;
  end if;

  return jsonb_build_object('lead_id', v_lead, 'contact_id', v_contact, 'duplicate', v_duplicate, 'consent_applied', v_applied);
end;
$$;

revoke execute on function public.intake_rate_hit(text, integer, integer), public.intake_lead(text, text, text, text, public.lead_service_type, public.borough, jsonb, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.intake_rate_hit(text, integer, integer), public.intake_lead(text, text, text, text, public.lead_service_type, public.borough, jsonb, text, boolean, text, text, text) to service_role;
