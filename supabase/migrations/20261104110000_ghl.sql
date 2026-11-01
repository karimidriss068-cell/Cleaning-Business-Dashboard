-- GoHighLevel integration (a separate sub-account for this business).
--
-- Inbound webhooks are notifications only: the server re-fetches the contact,
-- message, opportunity or appointment from GHL by id and calls the service-role
-- functions below with the fetched data. A reconciliation cron uses the same
-- functions, so they are idempotent. Outbound work reuses sync_queue (stage
-- updates, retried with backoff) and a planner that finds texts that are due.
-- Texts are dry-run per template until the owner switches one to live; nothing
-- is sent without sms_consent, to an opted-out number, or in quiet hours
-- (8am-9pm New York, enforced in src/lib/ghl/send-rules.ts).
--
-- Writes from the app go through admin functions (finance_log entity 'ghl');
-- the ghl_* functions that take provider data are service_role only.

alter table public.finance_log drop constraint finance_log_entity_check;
alter table public.finance_log add constraint finance_log_entity_check
  check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings', 'growth', 'ghl'));

-- Consent is explicit: it is set from the app or from a GHL tag, never assumed.
alter table public.contacts
  add column sms_consent boolean not null default false,
  add column sms_consent_at timestamptz,
  add column sms_consent_source text;

create table public.ghl_settings (
  id boolean primary key default true check (id),
  pipeline_id text,
  -- our stage -> GHL pipeline stage id, e.g. {"new": "...", "quoted": "..."}
  stage_ids jsonb not null default '{}' check (jsonb_typeof(stage_ids) = 'object'),
  opportunity_sync_mode text not null default 'dry_run' check (opportunity_sync_mode in ('dry_run', 'live')),
  business_name text not null default 'Keystone Clean' check (length(btrim(business_name)) > 0),
  max_texts_per_contact_per_day integer not null default 3 check (max_texts_per_contact_per_day between 1 and 20),
  max_texts_per_hour integer not null default 30 check (max_texts_per_hour between 1 and 500),
  last_webhook_at timestamptz,
  last_reconcile_at timestamptz,
  last_reconcile_note text,
  updated_at timestamptz not null default now()
);
insert into public.ghl_settings (id) values (true);

create table public.message_templates (
  key text primary key check (key in ('instant_reply', 'booking_confirmation', 'reminder_24h', 'review_request', 'payment_link')),
  label text not null,
  body text not null check (length(btrim(body)) between 1 and 600),
  mode text not null default 'dry_run' check (mode in ('dry_run', 'live')),
  updated_at timestamptz not null default now()
);
insert into public.message_templates (key, label, body) values
  ('instant_reply', 'Instant reply to a new lead', 'Hi {{first_name}}, thanks for contacting {{business}}! We got your request and someone will call you shortly. Reply STOP to opt out.'),
  ('booking_confirmation', 'Booking confirmation', 'Hi {{first_name}}, your {{business}} clean is booked for {{when}}. Reply STOP to opt out.'),
  ('reminder_24h', '24-hour reminder', 'Reminder: {{business}} is coming {{when}}. Reply STOP to opt out.'),
  ('review_request', 'Review request (2 hours after the visit)', 'Hi {{first_name}}, thanks for choosing {{business}}! If you were happy with your clean, a quick review would mean a lot. Reply STOP to opt out.'),
  ('payment_link', 'Payment link', 'Hi {{first_name}}, your {{business}} invoice is ready. Pay securely here: {{pay_link}} Reply STOP to opt out.');

-- One row per text the planner decided about; the unique dedupe_key is the claim.
create table public.message_log (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.message_templates (key),
  dedupe_key text not null unique,
  contact_id uuid references public.contacts (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  outcome text not null check (outcome in ('pending', 'sent', 'dry_run', 'blocked', 'failed')),
  reason text,
  body text,
  ghl_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index message_log_contact_idx on public.message_log (contact_id, created_at desc);
create index message_log_lead_idx on public.message_log (lead_id);
create index message_log_job_idx on public.message_log (job_id);
create index message_log_invoice_idx on public.message_log (invoice_id);
create index message_log_recent_idx on public.message_log (created_at desc);

create trigger ghl_settings_set_updated_at before update on public.ghl_settings
  for each row execute function private.set_updated_at();
create trigger message_templates_set_updated_at before update on public.message_templates
  for each row execute function private.set_updated_at();

alter table public.ghl_settings enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_log enable row level security;
revoke all on public.ghl_settings, public.message_templates, public.message_log from anon;
revoke insert, update, delete on public.ghl_settings, public.message_templates, public.message_log from authenticated;
create policy "ghl_settings: staff read" on public.ghl_settings for select to authenticated using ((select private.is_staff()));
create policy "message_templates: staff read" on public.message_templates for select to authenticated using ((select private.is_staff()));
create policy "message_log: staff read" on public.message_log for select to authenticated using ((select private.is_staff()));

-- sync_queue and webhook_events are service-role tables; the admin status function below reads them.
create index sync_queue_ghl_failed_idx on public.sync_queue (updated_at desc) where provider = 'ghl' and status in ('failed', 'dead');

-- ---------------------------------------------------------------------------
-- Owner/admin writes (invoker wrappers over definer bodies, like the finance functions)
-- ---------------------------------------------------------------------------

create function private.save_message_template(p_key text, p_body text, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_mode not in ('dry_run', 'live') then
    raise exception 'mode must be dry_run or live' using errcode = 'KC005';
  end if;
  if p_body is null or length(btrim(p_body)) = 0 or length(p_body) > 600 then
    raise exception 'the message must be 1 to 600 characters' using errcode = 'KC005';
  end if;
  if p_mode = 'live' and position('STOP' in upper(p_body)) = 0 then
    raise exception 'a live message must tell people they can reply STOP' using errcode = 'KC005';
  end if;
  update public.message_templates set body = btrim(p_body), mode = p_mode where key = p_key;
  if not found then
    raise exception 'unknown template' using errcode = 'KC005';
  end if;
  perform private.log_finance('ghl', null, 'template_saved', jsonb_build_object('template', p_key, 'mode', p_mode));
end;
$$;

create function public.save_message_template(p_key text, p_body text, p_mode text)
returns void language sql security invoker set search_path = '' as $$ select private.save_message_template(p_key, p_body, p_mode) $$;

create function private.save_ghl_settings(
  p_pipeline_id text, p_stage_ids jsonb, p_opportunity_sync_mode text, p_business_name text,
  p_max_per_contact_per_day integer, p_max_per_hour integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_opportunity_sync_mode not in ('dry_run', 'live') then
    raise exception 'mode must be dry_run or live' using errcode = 'KC005';
  end if;
  if p_stage_ids is null or jsonb_typeof(p_stage_ids) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_stage_ids) k where k not in ('new', 'contacted', 'quoted', 'won', 'lost')) then
    raise exception 'stage ids must be keyed by new, contacted, quoted, won or lost' using errcode = 'KC005';
  end if;
  if p_business_name is null or length(btrim(p_business_name)) = 0 then
    raise exception 'a business name is required' using errcode = 'KC005';
  end if;
  update public.ghl_settings
  set pipeline_id = nullif(btrim(coalesce(p_pipeline_id, '')), ''), stage_ids = p_stage_ids,
      opportunity_sync_mode = p_opportunity_sync_mode, business_name = btrim(p_business_name),
      max_texts_per_contact_per_day = p_max_per_contact_per_day, max_texts_per_hour = p_max_per_hour
  where id;
  perform private.log_finance('ghl', null, 'settings_saved', jsonb_build_object('opportunity_sync_mode', p_opportunity_sync_mode));
end;
$$;

create function public.save_ghl_settings(
  p_pipeline_id text, p_stage_ids jsonb, p_opportunity_sync_mode text, p_business_name text,
  p_max_per_contact_per_day integer, p_max_per_hour integer)
returns void language sql security invoker set search_path = '' as $$
  select private.save_ghl_settings(p_pipeline_id, p_stage_ids, p_opportunity_sync_mode, p_business_name, p_max_per_contact_per_day, p_max_per_hour) $$;

-- Staff and admin record consent (the customer agreed to texts); a revoked consent sticks.
create function private.set_sms_consent(p_contact_id uuid, p_consent boolean, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if not private.is_staff() then
    raise exception 'only office staff can record text consent' using errcode = 'KC004';
  end if;
  select phone into v_phone from public.contacts where id = p_contact_id;
  if not found then
    raise exception 'unknown contact' using errcode = 'KC005';
  end if;
  if p_consent and v_phone is null then
    raise exception 'this contact has no phone number' using errcode = 'KC005';
  end if;
  if p_consent and exists (select 1 from public.opt_outs where channel = 'sms' and value = v_phone) then
    raise exception 'this number opted out of texts' using errcode = 'KC004';
  end if;
  update public.contacts
  set sms_consent = p_consent, sms_consent_at = case when p_consent then now() else null end,
      sms_consent_source = case when p_consent then left(coalesce(nullif(btrim(p_source), ''), 'staff'), 60) else null end
  where id = p_contact_id;
  insert into public.activities (type, subject, contact_id, actor_user_id)
  values ('note', case when p_consent then 'Text consent recorded' else 'Text consent removed' end, p_contact_id, (select auth.uid()));
end;
$$;

create function public.set_sms_consent(p_contact_id uuid, p_consent boolean, p_source text default null)
returns void language sql security invoker set search_path = '' as $$ select private.set_sms_consent(p_contact_id, p_consent, p_source) $$;

-- Owner/admin retry of a failed or dead sync.
create function private.retry_ghl_sync(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.sync_queue
  set status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = null, last_error = null
  where id = p_id and provider = 'ghl' and status in ('failed', 'dead');
  if not found then
    raise exception 'that sync is not failed' using errcode = 'KC004';
  end if;
  perform private.log_finance('ghl', p_id, 'sync_retried', '{}');
end;
$$;

create function public.retry_ghl_sync(p_id uuid)
returns void language sql security invoker set search_path = '' as $$ select private.retry_ghl_sync(p_id) $$;

-- Everything the status page and the Command Center card need, owner/admin only.
create function private.ghl_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failed jsonb;
  v_queue jsonb;
  v_log jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(e), '[]') into v_failed from (
    select x as e from (
      select jsonb_build_object('kind', 'queue', 'id', q.id, 'what', q.operation, 'status', q.status, 'attempts', q.attempts,
               'error', left(coalesce(q.last_error, ''), 200), 'at', q.updated_at) as x, q.updated_at as t
      from public.sync_queue q where q.provider = 'ghl' and q.status in ('failed', 'dead')
      union all
      select jsonb_build_object('kind', 'webhook', 'id', w.id, 'what', w.event_id, 'status', w.status, 'attempts', 1,
               'error', left(coalesce(w.error, ''), 200), 'at', w.received_at), w.received_at
      from public.webhook_events w where w.provider = 'ghl' and w.status = 'failed'
      union all
      select jsonb_build_object('kind', 'message', 'id', m.id, 'what', m.template_key, 'status', m.outcome, 'attempts', 1,
               'error', left(coalesce(m.reason, ''), 200), 'at', m.created_at), m.created_at
      from public.message_log m where m.outcome = 'failed'
    ) u order by t desc limit 50) z;
  select jsonb_build_object(
    'pending', count(*) filter (where status in ('pending', 'running')),
    'failed', count(*) filter (where status in ('failed', 'dead')),
    'succeeded24h', count(*) filter (where status = 'succeeded' and completed_at > now() - interval '24 hours'))
  into v_queue from public.sync_queue where provider = 'ghl';
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'template', m.template_key, 'outcome', m.outcome, 'reason', m.reason, 'at', m.created_at) order by m.created_at desc), '[]')
  into v_log from (select * from public.message_log order by created_at desc limit 15) m;
  return jsonb_build_object(
    'failed', v_failed, 'queue', v_queue, 'recentMessages', v_log,
    'failedCount', jsonb_array_length(v_failed),
    'lastWebhookAt', (select last_webhook_at from public.ghl_settings),
    'lastReconcileAt', (select last_reconcile_at from public.ghl_settings),
    'lastReconcileNote', (select last_reconcile_note from public.ghl_settings),
    'webhooks24h', (select count(*) from public.webhook_events where provider = 'ghl' and received_at > now() - interval '24 hours'));
end;
$$;

create function public.ghl_sync_status()
returns jsonb language sql security invoker set search_path = '' as $$ select private.ghl_sync_status() $$;

-- The public invoker wrappers call these as the signed-in user, which checks the role itself.
revoke execute on function private.save_message_template(text, text, text), private.save_ghl_settings(text, jsonb, text, text, integer, integer),
  private.set_sms_consent(uuid, boolean, text), private.retry_ghl_sync(uuid), private.ghl_sync_status() from public, anon;
grant execute on function private.save_message_template(text, text, text), private.save_ghl_settings(text, jsonb, text, text, integer, integer),
  private.set_sms_consent(uuid, boolean, text), private.retry_ghl_sync(uuid), private.ghl_sync_status() to authenticated;
revoke execute on function public.save_message_template(text, text, text), public.save_ghl_settings(text, jsonb, text, text, integer, integer),
  public.set_sms_consent(uuid, boolean, text), public.retry_ghl_sync(uuid), public.ghl_sync_status() from public, anon;
grant execute on function public.save_message_template(text, text, text), public.save_ghl_settings(text, jsonb, text, text, integer, integer),
  public.set_sms_consent(uuid, boolean, text), public.retry_ghl_sync(uuid), public.ghl_sync_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Inbound (service role only; the caller has already verified the webhook and
-- re-fetched the record from GHL)
-- ---------------------------------------------------------------------------

create function private.ghl_source(p_source text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_source ilike any (array['%instagram%', '%facebook%', '%meta%', '%fb%']) then 'instagram'
    when p_source ilike '%google%' then 'google'
    when p_source ilike '%thumbtack%' then 'thumbtack'
    when p_source ilike '%referral%' then 'referral'
    else 'other' end
$$;

-- Upserts the contact and its open lead. Duplicates match on the GHL contact id, then the
-- normalized phone, then the lowercase email, so a person is never created twice.
create function public.ghl_upsert_lead(
  p_ghl_contact_id text, p_first_name text, p_last_name text, p_phone text, p_email text,
  p_source text default null, p_utm jsonb default '{}', p_opportunity_id text default null,
  p_service_type text default null, p_sms_consent boolean default false, p_dnd boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := private.normalize_us_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_utm jsonb := coalesce(p_utm, '{}');
  v_contact uuid;
  v_lead uuid;
  v_campaign uuid;
  v_created_contact boolean := false;
  v_created_lead boolean := false;
  v_service public.lead_service_type;
  v_source text := private.ghl_source(coalesce(p_source, v_utm ->> 'source'));
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if p_ghl_contact_id is null or btrim(p_ghl_contact_id) = '' then
    raise exception 'a GHL contact id is required' using errcode = 'KC005';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  v_service := case when p_service_type in ('residential', 'recurring', 'move_out', 'commercial') then p_service_type::public.lead_service_type else 'residential' end;

  select id into v_contact from public.contacts where ghl_contact_id = p_ghl_contact_id;
  if v_contact is null and v_phone is not null then
    select id into v_contact from public.contacts where phone = v_phone order by created_at limit 1;
  end if;
  if v_contact is null and v_email is not null then
    select id into v_contact from public.contacts where email = v_email order by created_at limit 1;
  end if;

  if v_contact is null then
    if v_phone is null and v_email is null then
      raise exception 'this GHL contact has no valid phone or email' using errcode = 'KC005';
    end if;
    insert into public.contacts (type, first_name, last_name, phone, email, source, ghl_contact_id,
                                 utm_source, utm_medium, utm_campaign, utm_term, utm_content)
    values (case when v_service = 'commercial' then 'commercial'::public.contact_type else 'residential'::public.contact_type end,
            coalesce(nullif(btrim(coalesce(p_first_name, '')), ''), 'New lead'), nullif(btrim(coalesce(p_last_name, '')), ''),
            v_phone, v_email, v_source, p_ghl_contact_id,
            left(v_utm ->> 'source', 120), left(v_utm ->> 'medium', 120), left(v_utm ->> 'campaign', 200),
            left(v_utm ->> 'term', 200), left(v_utm ->> 'content', 200))
    returning id into v_contact;
    v_created_contact := true;
  else
    update public.contacts
    set ghl_contact_id = coalesce(ghl_contact_id, p_ghl_contact_id),
        phone = coalesce(phone, v_phone), email = coalesce(email, v_email),
        utm_source = coalesce(utm_source, left(v_utm ->> 'source', 120)),
        utm_medium = coalesce(utm_medium, left(v_utm ->> 'medium', 120)),
        utm_campaign = coalesce(utm_campaign, left(v_utm ->> 'campaign', 200)),
        utm_term = coalesce(utm_term, left(v_utm ->> 'term', 200)),
        utm_content = coalesce(utm_content, left(v_utm ->> 'content', 200))
    where id = v_contact;
  end if;

  -- Consent from the GHL tag; a do-not-disturb flag or an existing opt-out always wins.
  select phone into v_phone from public.contacts where id = v_contact;
  if p_dnd and v_phone is not null then
    insert into public.opt_outs (channel, value, source, reason) values ('sms', v_phone, 'ghl', 'Do not disturb in GoHighLevel')
    on conflict (channel, value) do nothing;
  end if;
  if p_dnd or (v_phone is not null and exists (select 1 from public.opt_outs where channel = 'sms' and value = v_phone)) then
    update public.contacts set sms_consent = false, sms_consent_at = null, sms_consent_source = null where id = v_contact and sms_consent;
  elsif p_sms_consent and v_phone is not null then
    update public.contacts set sms_consent = true, sms_consent_at = coalesce(sms_consent_at, now()), sms_consent_source = coalesce(sms_consent_source, 'ghl_tag')
    where id = v_contact and not sms_consent;
  end if;

  -- The lead: by opportunity, else the contact's open lead, else a new one.
  if p_opportunity_id is not null then
    select id into v_lead from public.leads where ghl_opportunity_id = p_opportunity_id;
  end if;
  if v_lead is null then
    select id into v_lead from public.leads where contact_id = v_contact and stage in ('new', 'contacted', 'quoted') order by created_at desc limit 1;
  end if;
  if v_lead is null then
    select id into v_campaign from public.marketing_campaigns
    where lower(name) = lower(btrim(coalesce(v_utm ->> 'campaign', ''))) and id::text not like '5eed0000-%' limit 1;
    insert into public.leads (contact_id, service_type, source, campaign_id, ghl_opportunity_id, external_id, next_follow_up_on)
    values (v_contact, v_service, v_source, v_campaign, p_opportunity_id, p_opportunity_id, v_today)
    returning id into v_lead;
    v_created_lead := true;
    insert into public.activities (type, subject, body, lead_id, contact_id)
    values ('note', 'Lead created', format('Service: %s. Source: %s. From GoHighLevel.', v_service, coalesce(v_source, 'not set')), v_lead, v_contact);
    -- The owner's call-now task: it shows up as a follow-up due today.
    insert into public.activities (type, subject, body, lead_id, contact_id)
    values ('call', 'Call this lead now', 'New lead from GoHighLevel. Speed to lead matters.', v_lead, v_contact);
  elsif p_opportunity_id is not null then
    update public.leads set ghl_opportunity_id = coalesce(ghl_opportunity_id, p_opportunity_id), external_id = coalesce(external_id, p_opportunity_id)
    where id = v_lead;
  end if;

  return jsonb_build_object('lead_id', v_lead, 'contact_id', v_contact, 'created_lead', v_created_lead, 'created_contact', v_created_contact);
end;
$$;

-- A stage change that happened in GHL. The echo back to GHL is suppressed.
create function public.ghl_apply_stage(p_opportunity_id text, p_stage text, p_lost_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_quote uuid;
  v_reason text := nullif(btrim(coalesce(p_lost_reason, '')), '');
begin
  if p_stage not in ('new', 'contacted', 'quoted', 'won', 'lost') then
    raise exception 'unknown stage' using errcode = 'KC005';
  end if;
  select * into v_lead from public.leads where ghl_opportunity_id = p_opportunity_id for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'unknown opportunity');
  end if;
  if v_lead.stage::text = p_stage then
    return jsonb_build_object('applied', false, 'reason', 'already there', 'lead_id', v_lead.id);
  end if;
  if p_stage = 'lost' and v_reason is null then v_reason := 'Marked lost in GoHighLevel'; end if;

  perform set_config('app.ghl_origin', 'on', true);
  update public.leads
  set stage = p_stage::public.lead_stage, stage_changed_at = now(),
      closed_at = case when p_stage in ('won', 'lost') then now() else null end,
      lost_reason = case when p_stage = 'lost' then v_reason else null end,
      first_response_at = case when first_response_at is null and p_stage in ('contacted', 'quoted', 'won') then now() else first_response_at end,
      next_follow_up_on = case when p_stage in ('won', 'lost') then null else next_follow_up_on end
  where id = v_lead.id;

  select id into v_quote from public.quotes where lead_id = v_lead.id order by created_at desc limit 1;
  if v_quote is not null then
    if p_stage = 'quoted' then
      update public.quotes set status = 'sent', sent_at = coalesce(sent_at, now()), declined_at = null, accepted_at = null where id = v_quote and status in ('draft', 'sent', 'declined', 'accepted');
    elsif p_stage = 'won' then
      update public.quotes set status = 'accepted', accepted_at = now(), declined_at = null, sent_at = coalesce(sent_at, now()) where id = v_quote and status in ('draft', 'sent');
    elsif p_stage = 'lost' then
      update public.quotes set status = 'declined', declined_at = now() where id = v_quote and status in ('draft', 'sent');
    end if;
  end if;

  insert into public.activities (type, subject, body, lead_id, contact_id)
  values ('status_change', format('Stage: %s -> %s', private.stage_label(v_lead.stage), private.stage_label(p_stage::public.lead_stage)),
          case when p_stage = 'lost' then 'Reason: ' || v_reason else 'Changed in GoHighLevel' end, v_lead.id, v_lead.contact_id);
  return jsonb_build_object('applied', true, 'lead_id', v_lead.id);
end;
$$;

-- A text in or out of GHL, written once (external_id is unique). A STOP reply opts the number out.
-- The first human reply (not one of our automated templates) sets the lead's first-response time.
create function public.ghl_log_message(
  p_ghl_contact_id text, p_message_id text, p_direction text, p_body text, p_at timestamptz, p_automated boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts%rowtype;
  v_lead public.leads%rowtype;
  v_activity uuid;
  v_norm text := regexp_replace(lower(btrim(coalesce(p_body, ''))), '[^a-z]', '', 'g');
  v_stop boolean;
  v_at timestamptz := coalesce(p_at, now());
begin
  if p_direction not in ('inbound', 'outbound') then
    raise exception 'direction must be inbound or outbound' using errcode = 'KC005';
  end if;
  select * into v_contact from public.contacts where ghl_contact_id = p_ghl_contact_id;
  if not found then
    return jsonb_build_object('logged', false, 'reason', 'unknown contact');
  end if;
  select * into v_lead from public.leads where contact_id = v_contact.id
  order by (stage in ('new', 'contacted', 'quoted')) desc, created_at desc limit 1;

  insert into public.activities (type, direction, subject, body, occurred_at, contact_id, lead_id, external_id)
  values ('sms', p_direction::public.activity_direction,
          case when p_direction = 'inbound' then 'Text received' when p_automated then 'Automated text sent' else 'Text sent' end,
          left(p_body, 1600), v_at, v_contact.id, v_lead.id, p_message_id)
  on conflict (external_id) do nothing
  returning id into v_activity;
  if v_activity is null then
    return jsonb_build_object('logged', false, 'reason', 'duplicate');
  end if;

  v_stop := p_direction = 'inbound' and v_norm in ('stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout');
  if v_stop and v_contact.phone is not null then
    insert into public.opt_outs (channel, value, source, reason) values ('sms', v_contact.phone, 'stop_keyword', 'Replied STOP')
    on conflict (channel, value) do nothing;
    update public.contacts set sms_consent = false, sms_consent_at = null, sms_consent_source = null where id = v_contact.id;
    insert into public.activities (type, subject, contact_id, lead_id) values ('note', 'Opted out of texts (replied STOP)', v_contact.id, v_lead.id);
  end if;

  if p_direction = 'outbound' and not p_automated and v_lead.id is not null and v_lead.first_response_at is null and v_at >= v_lead.created_at then
    update public.leads set first_response_at = v_at where id = v_lead.id;
  end if;
  return jsonb_build_object('logged', true, 'opted_out', v_stop, 'lead_id', v_lead.id);
end;
$$;

-- An appointment booked, changed or cancelled in GHL: timeline entry, and the visit's time when a visit is linked.
create function public.ghl_log_appointment(
  p_appointment_id text, p_ghl_contact_id text, p_start timestamptz, p_end timestamptz, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact uuid;
  v_lead uuid;
  v_activity uuid;
  v_label text := case lower(coalesce(p_status, '')) when 'cancelled' then 'cancelled' when 'canceled' then 'cancelled' when 'noshow' then 'no-show' else 'booked' end;
begin
  select id into v_contact from public.contacts where ghl_contact_id = p_ghl_contact_id;
  if v_contact is null then
    return jsonb_build_object('logged', false, 'reason', 'unknown contact');
  end if;
  select id into v_lead from public.leads where contact_id = v_contact order by (stage in ('new', 'contacted', 'quoted')) desc, created_at desc limit 1;
  insert into public.activities (type, subject, body, contact_id, lead_id, external_id)
  values ('meeting', 'Appointment ' || v_label, 'In GoHighLevel, ' || to_char(p_start at time zone 'America/New_York', 'Mon DD, HH12:MI AM') || ' New York time.',
          v_contact, v_lead, 'appt:' || p_appointment_id || ':' || v_label || ':' || extract(epoch from p_start)::bigint)
  on conflict (external_id) do nothing returning id into v_activity;
  if v_activity is not null and v_label = 'booked' and p_end > p_start then
    update public.jobs set scheduled_start = p_start, scheduled_end = p_end
    where ghl_appointment_id = p_appointment_id and status = 'scheduled' and (scheduled_start, scheduled_end) is distinct from (p_start, p_end);
  end if;
  return jsonb_build_object('logged', v_activity is not null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Outbound (service role only)
-- ---------------------------------------------------------------------------

-- Texts that are due, with the data to fill the template. Whether to send is decided
-- in TypeScript (quiet hours, rate limits, dry-run); the claim below re-checks consent.
create function public.ghl_due_messages(p_now timestamptz default now())
returns table (template_key text, dedupe_key text, contact_id uuid, lead_id uuid, job_id uuid, invoice_id uuid,
               first_name text, ghl_contact_id text, event_at timestamptz, pay_token text)
language sql
stable
security definer
set search_path = ''
as $$
  -- a new lead from GHL that nobody has answered
  select 'instant_reply', 'instant_reply:' || l.id, c.id, l.id, null::uuid, null::uuid, c.first_name, c.ghl_contact_id, l.created_at, null::text
  from public.leads l join public.contacts c on c.id = l.contact_id
  where c.ghl_contact_id is not null and l.stage = 'new' and l.first_response_at is null and l.created_at > p_now - interval '12 hours'
  union all
  -- a visit just booked
  select 'booking_confirmation', 'booking_confirmation:' || j.id, c.id, null, j.id, null, c.first_name, c.ghl_contact_id, j.scheduled_start, null
  from public.jobs j join public.contacts c on c.id = j.contact_id
  where j.status = 'scheduled' and c.ghl_contact_id is not null and j.created_at > p_now - interval '24 hours' and j.scheduled_start > p_now
  union all
  -- a visit within the next 24 hours (not the last 3: too late to matter)
  select 'reminder_24h', 'reminder_24h:' || j.id, c.id, null, j.id, null, c.first_name, c.ghl_contact_id, j.scheduled_start, null
  from public.jobs j join public.contacts c on c.id = j.contact_id
  where j.status = 'scheduled' and c.ghl_contact_id is not null
    and j.scheduled_start > p_now + interval '3 hours' and j.scheduled_start <= p_now + interval '24 hours'
  union all
  -- two hours after a completed visit
  select 'review_request', 'review_request:' || j.id, c.id, null, j.id, null, c.first_name, c.ghl_contact_id, j.completed_at, null
  from public.jobs j join public.contacts c on c.id = j.contact_id
  where j.status = 'completed' and c.ghl_contact_id is not null
    and j.completed_at <= p_now - interval '2 hours' and j.completed_at > p_now - interval '26 hours'
  union all
  -- an invoice that has been sent and still has a balance
  select 'payment_link', 'payment_link:' || i.id, c.id, null, null, i.id, c.first_name, c.ghl_contact_id, i.sent_at, i.pay_token
  from public.invoices i join public.contacts c on c.id = i.contact_id
  where i.status in ('sent', 'partially_paid', 'overdue') and i.collected_at is null and c.ghl_contact_id is not null
    and i.sent_at is not null and i.sent_at > p_now - interval '72 hours'
$$;

-- Claims one text before anything is sent (rule 1). Refuses without consent or to an opted-out
-- number, and records why. In dry-run the row is final and nothing is sent.
create function public.ghl_claim_message(
  p_template text, p_dedupe text, p_contact uuid, p_lead uuid, p_job uuid, p_invoice uuid, p_body text, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contacts%rowtype;
  v_reason text;
  v_id uuid;
begin
  if exists (select 1 from public.message_log where dedupe_key = p_dedupe) then
    return jsonb_build_object('claimed', false, 'reason', 'already handled');
  end if;
  select * into v_c from public.contacts where id = p_contact;
  v_reason := case
    when not found then 'unknown contact'
    when v_c.phone is null then 'no phone number'
    when exists (select 1 from public.opt_outs where channel = 'sms' and value = v_c.phone) then 'opted out of texts'
    when not v_c.sms_consent then 'no text consent on file'
    else null end;
  insert into public.message_log (template_key, dedupe_key, contact_id, lead_id, job_id, invoice_id, outcome, reason, body)
  values (p_template, p_dedupe, p_contact, p_lead, p_job, p_invoice,
          case when v_reason is not null then 'blocked' when p_dry_run then 'dry_run' else 'pending' end,
          coalesce(v_reason, case when p_dry_run then 'Dry run: nothing sent' end), case when v_reason is null then left(p_body, 1600) end)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'already handled');
  end if;
  return jsonb_build_object('claimed', v_reason is null and not p_dry_run, 'id', v_id, 'reason', v_reason, 'dry_run', v_reason is null and p_dry_run);
end;
$$;

create function public.ghl_finish_message(p_id uuid, p_outcome text, p_ghl_message_id text default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.message_log%rowtype;
begin
  if p_outcome not in ('sent', 'failed') then
    raise exception 'outcome must be sent or failed' using errcode = 'KC005';
  end if;
  update public.message_log
  set outcome = p_outcome, ghl_message_id = p_ghl_message_id, reason = left(p_error, 300), sent_at = case when p_outcome = 'sent' then now() end
  where id = p_id and outcome = 'pending'
  returning * into v_m;
  if found and p_outcome = 'sent' and p_ghl_message_id is not null then
    insert into public.activities (type, direction, subject, body, contact_id, lead_id, job_id, external_id)
    values ('sms', 'outbound', 'Automated text sent', v_m.body, v_m.contact_id, v_m.lead_id, v_m.job_id, p_ghl_message_id)
    on conflict (external_id) do nothing;
  end if;
end;
$$;

-- Recent live sends for the rate limits.
create function public.ghl_send_counts(p_contact uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contactDay', count(*) filter (where contact_id = p_contact and created_at > p_now - interval '24 hours'),
    'hour', count(*) filter (where created_at > p_now - interval '1 hour'))
  from public.message_log where outcome in ('sent', 'pending') and created_at > p_now - interval '24 hours'
$$;

-- Queue results: backoff 30s doubling to a 6h cap, dead after max_attempts.
create function public.ghl_queue_fail(p_id uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.sync_queue%rowtype;
  v_status text;
begin
  select * into v_q from public.sync_queue where id = p_id and provider = 'ghl' for update;
  if not found then return 'missing'; end if;
  v_status := case when v_q.attempts >= v_q.max_attempts then 'dead' else 'pending' end;
  update public.sync_queue
  set status = v_status::public.sync_status, last_error = left(p_error, 300), locked_until = null,
      next_attempt_at = now() + make_interval(secs => least(30 * power(2, greatest(v_q.attempts - 1, 0)), 21600)::int)
  where id = p_id;
  return v_status;
end;
$$;

create function public.ghl_queue_done(p_id uuid, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sync_queue set status = 'succeeded', completed_at = now(), locked_until = null, last_error = left(p_note, 300) where id = p_id and provider = 'ghl'
$$;

create function public.ghl_touch(p_what text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_what = 'webhook' then
    update public.ghl_settings set last_webhook_at = now() where id;
  elsif p_what = 'reconcile' then
    update public.ghl_settings set last_reconcile_at = now(), last_reconcile_note = left(p_note, 300) where id;
  else
    raise exception 'unknown touch' using errcode = 'KC005';
  end if;
end;
$$;

-- A stage change in the app queues an update of the GHL opportunity (the processor reads the
-- lead's current stage when it runs). Changes that came from GHL are not echoed back.
create function private.ghl_enqueue_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ghl_opportunity_id is not null and coalesce(current_setting('app.ghl_origin', true), '') <> 'on' then
    insert into public.sync_queue (provider, direction, entity_type, entity_id, operation)
    values ('ghl', 'outbound', 'lead', new.id, 'update_opportunity')
    on conflict (provider, direction, entity_type, entity_id, operation) where status = 'pending' do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function private.ghl_enqueue_stage() from public, anon, authenticated;
create trigger leads_ghl_enqueue_stage after update of stage on public.leads
  for each row when (old.stage is distinct from new.stage) execute function private.ghl_enqueue_stage();

revoke execute on function
  public.ghl_upsert_lead(text, text, text, text, text, text, jsonb, text, text, boolean, boolean),
  public.ghl_apply_stage(text, text, text), public.ghl_log_message(text, text, text, text, timestamptz, boolean),
  public.ghl_log_appointment(text, text, timestamptz, timestamptz, text), public.ghl_due_messages(timestamptz),
  public.ghl_claim_message(text, text, uuid, uuid, uuid, uuid, text, boolean), public.ghl_finish_message(uuid, text, text, text),
  public.ghl_send_counts(uuid, timestamptz), public.ghl_queue_fail(uuid, text), public.ghl_queue_done(uuid, text), public.ghl_touch(text, text)
  from public, anon, authenticated;
grant execute on function
  public.ghl_upsert_lead(text, text, text, text, text, text, jsonb, text, text, boolean, boolean),
  public.ghl_apply_stage(text, text, text), public.ghl_log_message(text, text, text, text, timestamptz, boolean),
  public.ghl_log_appointment(text, text, timestamptz, timestamptz, text), public.ghl_due_messages(timestamptz),
  public.ghl_claim_message(text, text, uuid, uuid, uuid, uuid, text, boolean), public.ghl_finish_message(uuid, text, text, text),
  public.ghl_send_counts(uuid, timestamptz), public.ghl_queue_fail(uuid, text), public.ghl_queue_done(uuid, text), public.ghl_touch(text, text)
  to service_role;
