-- Invoice statuses for the billing workflow: draft, sent, partially paid,
-- paid, overdue, void. 'open' becomes 'sent'. New enum values can't be used
-- in the transaction that adds them, so the rest of the finance schema is in
-- the next migration.

alter type public.invoice_status rename value 'open' to 'sent';
alter type public.invoice_status add value if not exists 'partially_paid' after 'sent';
alter type public.invoice_status add value if not exists 'overdue' after 'partially_paid';
