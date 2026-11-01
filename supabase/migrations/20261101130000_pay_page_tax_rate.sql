-- The public pay page shows the tax line's rate; give it the invoice's own
-- snapshot instead of letting the page work it back from the amounts.
create or replace function public.invoice_for_pay_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status,
    'customer', coalesce(c.first_name, ac.name),
    'contact_id', i.contact_id, 'account_id', i.account_id,
    'stripe_customer_id', coalesce(ac.stripe_customer_id, c.stripe_customer_id),
    'issued_on', i.issued_on, 'due_on', i.due_on, 'notes', i.notes,
    'subtotal_cents', i.subtotal_cents, 'discount_cents', i.discount_cents, 'tax_cents', i.tax_cents,
    'tax_rate_ppm', i.tax_rate_ppm,
    'total_cents', i.total_cents, 'deposit_cents', i.deposit_cents, 'amount_paid_cents', i.amount_paid_cents,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('description', li.description, 'quantity', li.quantity,
        'unit_price_cents', li.unit_price_cents, 'line_total_cents', li.line_total_cents, 'taxable', li.taxable)
        order by li.sort_order, li.created_at)
      from public.invoice_line_items li where li.invoice_id = i.id and not li.voided), '[]'::jsonb))
  from public.invoices i
  left join public.contacts c on c.id = i.contact_id
  left join public.accounts ac on ac.id = i.account_id
  where i.pay_token = p_token and i.status <> 'draft'
$$;

-- CREATE OR REPLACE keeps the grants, but state them again so this file stands alone.
revoke execute on function public.invoice_for_pay_token(text) from public, anon, authenticated;
grant execute on function public.invoice_for_pay_token(text) to service_role;
