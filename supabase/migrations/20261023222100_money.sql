-- Money: invoices, payments (Stripe, test mode for now), vendors, expenses,
-- and subcontractor payouts. All amounts are integer cents.
--
-- Integrity enforced here, not in app code:
--   * invoice subtotal / amount paid and payout totals are trigger-maintained;
--     line totals and invoice totals are generated columns.
--   * a job can be billed on at most one invoice line (unique job_id).
--   * a job assignment can be paid at most once (unique job_assignment_id).
--   * Stripe ids are unique, so a re-delivered webhook can't double-record.
--   * once a payout is approved or paid, its items and the underlying
--     assignment pay are frozen.
--
-- Access: invoices staff read/write (admin delete); payments staff read,
-- admin write (the Stripe webhook writes with the service role); vendors and
-- expenses staff read/write (admin delete); payouts admin only.

create type public.invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
create type public.payment_method as enum ('card', 'ach', 'check', 'cash', 'zelle', 'other');
create type public.expense_category as enum ('supplies', 'equipment', 'transit', 'marketing', 'software', 'insurance', 'other');
create type public.payout_status as enum ('draft', 'approved', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity unique,
  contact_id uuid references public.contacts (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  status public.invoice_status not null default 'draft',
  issued_on date,
  due_on date,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  -- No tax rules yet; set explicitly when needed.
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint generated always as (subtotal_cents + tax_cents) stored,
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  stripe_invoice_id text unique,
  stripe_hosted_invoice_url text,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_has_customer check (num_nonnulls(contact_id, account_id) >= 1),
  constraint invoices_dates check (due_on is null or issued_on is null or due_on >= issued_on)
);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  job_id uuid unique references public.jobs (id) on delete set null,
  description text not null check (length(btrim(description)) > 0),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint generated always as (quantity * unit_price_cents) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  status public.payment_status not null default 'pending',
  method public.payment_method not null default 'card',
  stripe_payment_intent_id text unique,
  stripe_charge_id text unique,
  received_at timestamptz,
  refunded_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  category public.expense_category,
  email text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors (id) on delete set null,
  category public.expense_category not null,
  description text not null check (length(btrim(description)) > 0),
  amount_cents bigint not null check (amount_cents > 0),
  incurred_on date not null,
  job_id uuid references public.jobs (id) on delete set null,
  -- Object path inside the receipts bucket.
  receipt_path text unique,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors (id) on delete restrict,
  -- Pay period as America/New_York calendar dates.
  period_start date not null,
  period_end date not null,
  status public.payout_status not null default 'draft',
  total_cents bigint not null default 0 check (total_cents >= 0),
  payout_vendor_ref text,
  approved_at timestamptz,
  approved_by uuid references public.profiles (user_id) on delete set null,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_period check (period_end >= period_start),
  constraint payouts_subcontractor_period_key unique (subcontractor_id, period_start, period_end)
);

create table public.payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts (id) on delete cascade,
  job_assignment_id uuid not null unique references public.job_assignments (id) on delete restrict,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_contact_id_idx on public.invoices (contact_id);
create index invoices_account_id_idx on public.invoices (account_id);
create index invoices_status_due_on_idx on public.invoices (status, due_on);
create index invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id, sort_order);
create index payments_invoice_id_idx on public.payments (invoice_id);
create index expenses_vendor_id_idx on public.expenses (vendor_id);
create index expenses_job_id_idx on public.expenses (job_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_incurred_on_idx on public.expenses (incurred_on);
create index payouts_approved_by_idx on public.payouts (approved_by);
create index payouts_status_idx on public.payouts (status);
create index payout_items_payout_id_idx on public.payout_items (payout_id);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();
create trigger invoice_line_items_set_updated_at before update on public.invoice_line_items
  for each row execute function private.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function private.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors
  for each row execute function private.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function private.set_updated_at();
create trigger payouts_set_updated_at before update on public.payouts
  for each row execute function private.set_updated_at();
create trigger payout_items_set_updated_at before update on public.payout_items
  for each row execute function private.set_updated_at();

-- Derived totals -------------------------------------------------------------------

create function private.recompute_invoice_subtotal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.invoice_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.invoice_id end
  ], null)
  loop
    update public.invoices i
    set subtotal_cents = coalesce(
      (select sum(li.line_total_cents) from public.invoice_line_items li where li.invoice_id = affected), 0)
    where i.id = affected;
  end loop;
  return null;
end;
$$;

create trigger invoice_line_items_recompute_subtotal
  after insert or update or delete on public.invoice_line_items
  for each row execute function private.recompute_invoice_subtotal();

-- Only succeeded payments count toward the paid amount.
create function private.recompute_invoice_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.invoice_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.invoice_id end
  ], null)
  loop
    update public.invoices i
    set amount_paid_cents = coalesce(
      (select sum(p.amount_cents) from public.payments p
       where p.invoice_id = affected and p.status = 'succeeded'), 0)
    where i.id = affected;
  end loop;
  return null;
end;
$$;

create trigger payments_recompute_invoice_paid
  after insert or update or delete on public.payments
  for each row execute function private.recompute_invoice_paid();

-- Payouts ----------------------------------------------------------------------------

-- Items must belong to the payout's subcontractor, and can only change
-- while the payout is a draft.
create function private.guard_payout_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.payout_status;
  v_payout_sub uuid;
  v_assignment_sub uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select p.status into v_status from public.payouts p where p.id = old.payout_id;
    if v_status <> 'draft' then
      raise exception 'payout % is %; its items are frozen', old.payout_id, v_status using errcode = 'P0001';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select p.status, p.subcontractor_id into v_status, v_payout_sub
    from public.payouts p where p.id = new.payout_id;
    if v_status <> 'draft' then
      raise exception 'payout % is %; its items are frozen', new.payout_id, v_status using errcode = 'P0001';
    end if;
    select a.subcontractor_id into v_assignment_sub
    from public.job_assignments a where a.id = new.job_assignment_id;
    if v_assignment_sub is distinct from v_payout_sub then
      raise exception 'assignment % belongs to a different subcontractor', new.job_assignment_id using errcode = 'P0001';
    end if;
    return new;
  end if;

  return old;
end;
$$;

create trigger payout_items_guard
  before insert or update or delete on public.payout_items
  for each row execute function private.guard_payout_item();

create function private.recompute_payout_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.payout_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.payout_id end
  ], null)
  loop
    update public.payouts p
    set total_cents = coalesce(
      (select sum(pi.amount_cents) from public.payout_items pi where pi.payout_id = affected), 0)
    where p.id = affected;
  end loop;
  return null;
end;
$$;

create trigger payout_items_recompute_total
  after insert or update or delete on public.payout_items
  for each row execute function private.recompute_payout_total();

-- Once an assignment is on an approved or paid payout, its pay can't change.
-- security definer: staff edit assignments but can't read payouts, so under
-- their RLS this check would see no payouts and always pass.
create function private.guard_paid_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pay_cents is distinct from old.pay_cents and exists (
    select 1
    from public.payout_items pi
    join public.payouts p on p.id = pi.payout_id
    where pi.job_assignment_id = new.id and p.status in ('approved', 'paid')
  ) then
    raise exception 'assignment % is on an approved or paid payout; its pay is frozen', new.id using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- AFTER (not BEFORE) so pay_cents reflects the generated value.
create trigger job_assignments_guard_paid
  after update on public.job_assignments
  for each row execute function private.guard_paid_assignment();

revoke all on function private.recompute_invoice_subtotal(), private.recompute_invoice_paid(),
  private.guard_payout_item(), private.recompute_payout_total(), private.guard_paid_assignment()
  from public, anon, authenticated;

-- RLS ------------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.vendors enable row level security;
alter table public.expenses enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_items enable row level security;
revoke all on public.invoices, public.invoice_line_items, public.payments, public.vendors,
  public.expenses, public.payouts, public.payout_items from anon;

create policy "invoices: staff read" on public.invoices for select to authenticated using ((select private.is_staff()));
create policy "invoices: staff insert" on public.invoices for insert to authenticated with check ((select private.is_staff()));
create policy "invoices: staff update" on public.invoices for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "invoices: admin delete" on public.invoices for delete to authenticated using ((select private.is_admin()));

create policy "invoice_line_items: staff read" on public.invoice_line_items for select to authenticated using ((select private.is_staff()));
create policy "invoice_line_items: staff insert" on public.invoice_line_items for insert to authenticated with check ((select private.is_staff()));
create policy "invoice_line_items: staff update" on public.invoice_line_items for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "invoice_line_items: staff delete" on public.invoice_line_items for delete to authenticated using ((select private.is_staff()));

create policy "payments: staff read" on public.payments for select to authenticated using ((select private.is_staff()));
create policy "payments: admin insert" on public.payments for insert to authenticated with check ((select private.is_admin()));
create policy "payments: admin update" on public.payments for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "payments: admin delete" on public.payments for delete to authenticated using ((select private.is_admin()));

create policy "vendors: staff read" on public.vendors for select to authenticated using ((select private.is_staff()));
create policy "vendors: staff insert" on public.vendors for insert to authenticated with check ((select private.is_staff()));
create policy "vendors: staff update" on public.vendors for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "vendors: admin delete" on public.vendors for delete to authenticated using ((select private.is_admin()));

create policy "expenses: staff read" on public.expenses for select to authenticated using ((select private.is_staff()));
create policy "expenses: staff insert" on public.expenses for insert to authenticated with check ((select private.is_staff()));
create policy "expenses: staff update" on public.expenses for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "expenses: admin delete" on public.expenses for delete to authenticated using ((select private.is_admin()));

create policy "payouts: admin read" on public.payouts for select to authenticated using ((select private.is_admin()));
create policy "payouts: admin insert" on public.payouts for insert to authenticated with check ((select private.is_admin()));
create policy "payouts: admin update" on public.payouts for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "payouts: admin delete" on public.payouts for delete to authenticated using ((select private.is_admin()));

create policy "payout_items: admin read" on public.payout_items for select to authenticated using ((select private.is_admin()));
create policy "payout_items: admin insert" on public.payout_items for insert to authenticated with check ((select private.is_admin()));
create policy "payout_items: admin update" on public.payout_items for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "payout_items: admin delete" on public.payout_items for delete to authenticated using ((select private.is_admin()));

-- Private bucket for expense receipts.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts: staff read"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (select private.is_staff()));
create policy "receipts: staff insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (select private.is_staff()));
create policy "receipts: admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (select private.is_admin()))
  with check (bucket_id = 'receipts' and (select private.is_admin()));
create policy "receipts: admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (select private.is_admin()));
