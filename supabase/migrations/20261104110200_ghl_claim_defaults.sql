-- ghl_claim_message: the optional ids need defaults (the API leaves out what the caller didn't send, and a
-- function whose optional args have none is then "not found"). Optional arguments must come last.

drop function public.ghl_claim_message(text, text, uuid, uuid, uuid, uuid, text, boolean);

create function public.ghl_claim_message(
  p_template text, p_dedupe text, p_contact uuid, p_body text, p_dry_run boolean,
  p_lead uuid default null, p_job uuid default null, p_invoice uuid default null)
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

revoke execute on function public.ghl_claim_message(text, text, uuid, text, boolean, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ghl_claim_message(text, text, uuid, text, boolean, uuid, uuid, uuid) to service_role;
