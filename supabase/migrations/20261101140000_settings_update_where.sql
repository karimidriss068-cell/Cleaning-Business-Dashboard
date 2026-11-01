-- Supabase's API role refuses an UPDATE with no WHERE clause (pg-safeupdate),
-- so the settings update has to name its one row. The SQL tests run as the
-- table owner, which that guard doesn't apply to; the browser test caught it.
create or replace function private.update_business_settings(
  p_tax_rate_ppm integer, p_default_line_taxable boolean, p_invoice_due_days integer,
  p_threshold_cents bigint, p_warn_bps integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.business_settings%rowtype;
begin
  perform private.require_admin();
  if p_tax_rate_ppm not between 0 and 300000 or p_invoice_due_days not between 0 and 120
     or p_threshold_cents < 0 or p_warn_bps not between 1 and 10000 then
    raise exception 'one of the settings is out of range' using errcode = 'KC005';
  end if;
  select * into v_old from public.business_settings where id;
  update public.business_settings
  set tax_rate_ppm = p_tax_rate_ppm, default_line_taxable = p_default_line_taxable,
      invoice_due_days = p_invoice_due_days, form_1099_threshold_cents = p_threshold_cents,
      form_1099_warn_bps = p_warn_bps, updated_by = (select auth.uid())
  where id;
  perform private.log_finance('settings', null, 'updated', jsonb_build_object(
    'tax_rate_ppm', jsonb_build_array(v_old.tax_rate_ppm, p_tax_rate_ppm),
    'default_line_taxable', jsonb_build_array(v_old.default_line_taxable, p_default_line_taxable),
    'invoice_due_days', jsonb_build_array(v_old.invoice_due_days, p_invoice_due_days),
    'form_1099_threshold_cents', jsonb_build_array(v_old.form_1099_threshold_cents, p_threshold_cents),
    'form_1099_warn_bps', jsonb_build_array(v_old.form_1099_warn_bps, p_warn_bps)));
end;
$$;
revoke execute on function private.update_business_settings(integer, boolean, integer, bigint, integer) from public, anon;
grant execute on function private.update_business_settings(integer, boolean, integer, bigint, integer) to authenticated;
