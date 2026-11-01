-- The API leaves out a parameter the caller didn't send, and a function whose
-- optional arguments have no default then can't be found. Give the optional
-- ones of the invoice and payout wrappers a default of null.

create or replace function public.save_invoice(p_invoice_id uuid, p_expected_updated_at timestamptz, p_lines jsonb, p_discount_cents bigint, p_deposit_cents bigint, p_due_on date default null, p_notes text default null)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.save_invoice(p_invoice_id, p_expected_updated_at, p_lines, p_discount_cents, p_deposit_cents, p_due_on, p_notes) $$;

create or replace function public.record_manual_payment(p_invoice_id uuid, p_amount_cents bigint, p_method public.payment_method, p_reference text default null, p_received_on date default null, p_request_id uuid default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_manual_payment(p_invoice_id, p_amount_cents, p_method, p_reference, p_received_on, p_request_id) $$;

create or replace function public.record_refund(p_payment_id uuid, p_amount_cents bigint, p_reason text default null, p_request_id uuid default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_refund(p_payment_id, p_amount_cents, p_reason, p_request_id) $$;

create or replace function public.create_card_request(p_contact_id uuid default null, p_account_id uuid default null)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.create_card_request(p_contact_id, p_account_id) $$;

create or replace function public.mark_payout_paid(p_payout_id uuid, p_method public.payment_method, p_reference text, p_paid_on date default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.mark_payout_paid(p_payout_id, p_method, p_reference, p_paid_on) $$;
