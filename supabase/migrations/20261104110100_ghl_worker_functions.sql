-- Worker helpers for the GHL queue (service role only). claim_sync_queue serves every provider;
-- this one claims GHL rows only, so another integration's work is never picked up by mistake.

create function public.ghl_claim_queue(p_limit integer default 20, p_lock_seconds integer default 300)
returns setof public.sync_queue
language sql
security definer
set search_path = ''
as $$
  update public.sync_queue q
  set status = 'running', attempts = q.attempts + 1, locked_until = now() + make_interval(secs => p_lock_seconds)
  where q.id in (
    select c.id from public.sync_queue c
    where c.provider = 'ghl' and ((c.status = 'pending' and c.next_attempt_at <= now())
       or (c.status = 'running' and c.locked_until < now() and c.attempts < c.max_attempts))
    order by c.next_attempt_at
    limit p_limit
    for update skip locked
  )
  returning q.*
$$;

-- Put a claimed row back for later without counting the wait as an attempt (quiet hours).
create function public.ghl_queue_defer(p_id uuid, p_until timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sync_queue
  set status = 'pending', attempts = greatest(attempts - 1, 0), next_attempt_at = p_until, locked_until = null
  where id = p_id and provider = 'ghl'
$$;

-- Why a contact cannot be texted right now (null means they can).
create function public.ghl_can_text(p_contact uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contacts%rowtype;
begin
  select * into c from public.contacts where id = p_contact;
  if not found then return 'unknown contact'; end if;
  if c.phone is null then return 'no phone number'; end if;
  if exists (select 1 from public.opt_outs o where o.channel = 'sms' and o.value = c.phone) then return 'opted out of texts'; end if;
  if not c.sms_consent then return 'no text consent on file'; end if;
  return null;
end;
$$;

-- Refresh what GHL knows about a contact we already have (consent tag, do-not-disturb, missing
-- phone or email). It never creates a contact or a lead; the reconciliation uses it for updates.
create function public.ghl_refresh_contact(
  p_ghl_contact_id text, p_phone text default null, p_email text default null, p_sms_consent boolean default false, p_dnd boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.contacts%rowtype;
  v_phone text := private.normalize_us_phone(p_phone);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select * into v_c from public.contacts where ghl_contact_id = p_ghl_contact_id;
  if not found then return false; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
  update public.contacts set phone = coalesce(phone, v_phone), email = coalesce(email, v_email) where id = v_c.id;
  select phone into v_phone from public.contacts where id = v_c.id;
  if p_dnd and v_phone is not null then
    insert into public.opt_outs (channel, value, source, reason) values ('sms', v_phone, 'ghl', 'Do not disturb in GoHighLevel')
    on conflict (channel, value) do nothing;
  end if;
  if p_dnd or (v_phone is not null and exists (select 1 from public.opt_outs where channel = 'sms' and value = v_phone)) then
    update public.contacts set sms_consent = false, sms_consent_at = null, sms_consent_source = null where id = v_c.id and sms_consent;
  elsif p_sms_consent and v_phone is not null then
    update public.contacts set sms_consent = true, sms_consent_at = coalesce(sms_consent_at, now()), sms_consent_source = coalesce(sms_consent_source, 'ghl_tag')
    where id = v_c.id and not sms_consent;
  end if;
  return true;
end;
$$;

revoke execute on function public.ghl_claim_queue(integer, integer), public.ghl_queue_defer(uuid, timestamptz), public.ghl_can_text(uuid),
  public.ghl_refresh_contact(text, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.ghl_claim_queue(integer, integer), public.ghl_queue_defer(uuid, timestamptz), public.ghl_can_text(uuid),
  public.ghl_refresh_contact(text, text, text, boolean, boolean) to service_role;
