-- Invoices & Payouts.
--
-- Rules enforced here, not in app code:
--   * Money tables (invoices, lines, payments, refunds, payouts, payout items,
--     settings, finance log) are read-only to signed-in users. Every change goes
--     through a function that checks the role, runs in one transaction and
--     writes finance_log. Staff can read invoices; only owner/admin change
--     anything. Payouts, refunds of payouts, 1099 data: owner/admin only.
--   * One live invoice per job (partial unique index; voiding frees the job).
--   * Invoice lines freeze once the invoice leaves draft; a void invoice is final.
--   * Payments and refunds recompute amount paid and the status
--     (sent / partially paid / paid / overdue) in a trigger.
--   * Stripe ids are unique, so a re-delivered webhook can't record twice.
--   * A visit can be paid out only when its invoice is paid or marked collected,
--     and at most once (unique active payout item). Approved payouts are frozen.
-- Errors (SQLSTATE): KC001 stale, KC004 not allowed / wrong state, KC005 bad
-- input, KC010 already exists.

-- ---------------------------------------------------------------------------
-- Settings and the finance log
-- ---------------------------------------------------------------------------

create table public.business_settings (
  id boolean primary key default true check (id),
  -- Sales tax: off by default. Rate in parts per million (8.875% = 88750). A line is taxed only when its own switch is on
  -- AND the rate is above zero. Each invoice snapshots the rate when created.
  tax_rate_ppm integer not null default 0 check (tax_rate_ppm between 0 and 300000),
  default_line_taxable boolean not null default false,
  invoice_due_days integer not null default 14 check (invoice_due_days between 0 and 120),
  -- IRS 1099 reporting threshold per subcontractor per calendar year. This
  -- is a setting on purpose: confirm the current figure with your accountant.
  form_1099_threshold_cents bigint not null default 200000 check (form_1099_threshold_cents >= 0),
  -- "Approaching" starts at this share of the threshold (basis points).
  form_1099_warn_bps integer not null default 8000 check (form_1099_warn_bps between 1 and 10000),
  updated_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.business_settings default values;
create index business_settings_updated_by_idx on public.business_settings (updated_by);
create trigger business_settings_set_updated_at before update on public.business_settings
  for each row execute function private.set_updated_at();

create table public.finance_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  entity text not null check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings')),
  entity_id uuid,
  action text not null check (length(btrim(action)) > 0),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
);
create index finance_log_entity_idx on public.finance_log (entity, entity_id, occurred_at desc);
create index finance_log_actor_user_id_idx on public.finance_log (actor_user_id);
create index finance_log_occurred_at_idx on public.finance_log (occurred_at desc);

create function private.log_finance(p_entity text, p_entity_id uuid, p_action text, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.finance_log (actor_user_id, entity, entity_id, action, detail)
  values ((select auth.uid()), p_entity, p_entity_id, p_action, coalesce(p_detail, '{}'::jsonb))
$$;
revoke execute on function private.log_finance(text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------


alter table public.invoices
  add column quote_id uuid references public.quotes (id) on delete set null,
  add column discount_cents bigint not null default 0 check (discount_cents >= 0),
  -- Taken up front; the balance is whatever remains of the total.
  add column deposit_cents bigint not null default 0 check (deposit_cents >= 0),
  add column tax_rate_ppm integer not null default 0 check (tax_rate_ppm between 0 and 300000),
  add column pay_token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  add column collected_at timestamptz,
  add column collected_by uuid references public.profiles (user_id) on delete set null,
  add column collected_note text,
  add column created_by uuid references public.profiles (user_id) on delete set null;

alter table public.invoices drop column total_cents;
alter table public.invoices
  add column total_cents bigint generated always as (subtotal_cents - discount_cents + tax_cents) stored;
alter table public.invoices add constraint invoices_discount_le_subtotal check (discount_cents <= subtotal_cents);
alter table public.invoices add constraint invoices_deposit_le_total check (deposit_cents <= subtotal_cents - discount_cents + tax_cents);
alter table public.invoices add constraint invoices_collected_has_note
  check (collected_at is null or (collected_note is not null and length(btrim(collected_note)) > 0));

create index invoices_quote_id_idx on public.invoices (quote_id);
create index invoices_collected_by_idx on public.invoices (collected_by);
create index invoices_created_by_idx on public.invoices (created_by);
create unique index invoices_live_quote_key on public.invoices (quote_id) where quote_id is not null and status <> 'void';

-- A voided invoice releases its jobs so they can be billed again.
alter table public.invoice_line_items
  add column taxable boolean not null default false,
  add column voided boolean not null default false;
alter table public.invoice_line_items drop constraint invoice_line_items_job_id_key;
create unique index invoice_line_items_live_job_key on public.invoice_line_items (job_id) where job_id is not null and not voided;
create index invoice_line_items_job_id_idx on public.invoice_line_items (job_id);

-- Payments --------------------------------------------------------------------

alter table public.payments
  add column source text not null default 'manual' check (source in ('manual', 'stripe')),
  add column reference text,
  add column recorded_by uuid references public.profiles (user_id) on delete set null,
  -- Client-generated id so a double click or retry records once.
  add column request_id uuid unique,
  add column stripe_checkout_session_id text unique;
update public.payments set source = 'stripe' where stripe_payment_intent_id is not null;
alter table public.payments add constraint payments_manual_reference
  check (source <> 'manual' or method not in ('zelle', 'check') or (reference is not null and length(btrim(reference)) > 0));
create index payments_recorded_by_idx on public.payments (recorded_by);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  reason text,
  -- Refunds are issued by hand (Stripe dashboard, Zelle, check) and recorded here.
  source text not null default 'manual' check (source in ('manual', 'stripe')),
  stripe_refund_id text unique,
  request_id uuid unique,
  recorded_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index refunds_payment_id_idx on public.refunds (payment_id);
create index refunds_recorded_by_idx on public.refunds (recorded_by);

create function private.guard_refund()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_amount bigint;
  v_status public.payment_status;
  v_refunded bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'refunds can''t be changed or deleted' using errcode = 'KC004';
  end if;
  select amount_cents, status into v_amount, v_status from public.payments where id = new.payment_id for update;
  if v_status <> 'succeeded' then
    raise exception 'only a received payment can be refunded' using errcode = 'KC004';
  end if;
  select coalesce(sum(amount_cents), 0) into v_refunded from public.refunds where payment_id = new.payment_id;
  if v_refunded + new.amount_cents > v_amount then
    raise exception 'refunds would exceed the payment (% already refunded of %)', v_refunded, v_amount using errcode = 'KC005';
  end if;
  return new;
end;
$$;
create trigger refunds_guard before insert or update or delete on public.refunds
  for each row execute function private.guard_refund();
revoke execute on function private.guard_refund() from public, anon, authenticated;

-- Cards on file (Stripe ids and display details only; never a card number) ----

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  stripe_payment_method_id text not null unique,
  brand text,
  last4 text check (last4 ~ '^[0-9]{4}$'),
  exp_month integer check (exp_month between 1 and 12),
  exp_year integer check (exp_year between 2000 and 2200),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint payment_methods_has_customer check (num_nonnulls(contact_id, account_id) >= 1)
);
create index payment_methods_contact_id_idx on public.payment_methods (contact_id);
create index payment_methods_account_id_idx on public.payment_methods (account_id);

-- A link the owner sends so a customer can save a card ahead of the clean.
create table public.card_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  contact_id uuid references public.contacts (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete cascade,
  created_by uuid references public.profiles (user_id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint card_requests_has_customer check (num_nonnulls(contact_id, account_id) >= 1)
);
create index card_requests_contact_id_idx on public.card_requests (contact_id);
create index card_requests_account_id_idx on public.card_requests (account_id);
create index card_requests_created_by_idx on public.card_requests (created_by);

-- Triggers: totals, status, guards ------------------------------------------------

-- Tax applies to the taxable lines after their share of any discount.
-- Integer math, rounded half up; the rate is in parts per million.
create function private.calc_tax_cents(p_sub bigint, p_taxable bigint, p_discount bigint, p_rate_ppm bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_sub <= 0 then 0 else
    (greatest(p_taxable - (p_discount * p_taxable + p_sub / 2) / p_sub, 0) * p_rate_ppm + 500000) / 1000000 end
$$;
revoke execute on function private.calc_tax_cents(bigint, bigint, bigint, bigint) from public, anon, authenticated;

create or replace function private.recompute_invoice_subtotal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
  v_sub bigint;
  v_taxable bigint;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.invoice_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.invoice_id end
  ], null)
  loop
    select coalesce(sum(li.line_total_cents), 0), coalesce(sum(li.line_total_cents) filter (where li.taxable), 0)
    into v_sub, v_taxable
    from public.invoice_line_items li where li.invoice_id = affected and not li.voided;
    -- Only drafts are recomputed; later invoices are frozen (and a void
    -- invoice's lines flip to voided without touching its totals).
    update public.invoices i
    set subtotal_cents = v_sub,
        discount_cents = least(i.discount_cents, v_sub),
        tax_cents = private.calc_tax_cents(v_sub, v_taxable, least(i.discount_cents, v_sub), i.tax_rate_ppm),
        deposit_cents = least(i.deposit_cents,
          v_sub - least(i.discount_cents, v_sub) + private.calc_tax_cents(v_sub, v_taxable, least(i.discount_cents, v_sub), i.tax_rate_ppm))
    where i.id = affected and i.status = 'draft';
  end loop;
  return null;
end;
$$;

create function private.guard_invoice_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.invoice_status;
begin
  select i.status into v_status from public.invoices i where i.id = coalesce(new.invoice_id, old.invoice_id);
  -- A cascade from deleting a draft invoice finds no invoice row: allowed.
  if tg_op = 'UPDATE' and new.voided and not old.voided and v_status = 'void'
     and (new.invoice_id, new.job_id, new.description, new.quantity, new.unit_price_cents, new.taxable)
         is not distinct from (old.invoice_id, old.job_id, old.description, old.quantity, old.unit_price_cents, old.taxable) then
    return new;
  end if;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'invoice lines can only change while the invoice is a draft' using errcode = 'KC004';
  end if;
  if tg_op <> 'DELETE' and new.voided then
    raise exception 'lines are voided only by voiding their invoice' using errcode = 'KC004';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger invoice_line_items_guard before insert or update or delete on public.invoice_line_items
  for each row execute function private.guard_invoice_line();

create function private.guard_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lines integer;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only draft invoices can be deleted (invoice % is %)', old.invoice_number, old.status using errcode = 'KC004';
    end if;
    return old;
  end if;

  if old.status = 'void' then
    -- Money that arrives late (a Stripe payment after the void) is still
    -- recorded; nothing else about a void invoice may change.
    if (to_jsonb(new) - 'amount_paid_cents' - 'updated_at' - 'paid_at') = (to_jsonb(old) - 'amount_paid_cents' - 'updated_at' - 'paid_at') then
      return new;
    end if;
    raise exception 'invoice % is void and can''t be changed', old.invoice_number using errcode = 'KC004';
  end if;

  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('draft', 'sent'), ('draft', 'void'),
      ('sent', 'partially_paid'), ('sent', 'overdue'), ('sent', 'paid'), ('sent', 'void'),
      ('partially_paid', 'sent'), ('partially_paid', 'overdue'), ('partially_paid', 'paid'),
      ('overdue', 'sent'), ('overdue', 'partially_paid'), ('overdue', 'paid'), ('overdue', 'void'),
      ('paid', 'sent'), ('paid', 'partially_paid'), ('paid', 'overdue')
    ) then
      raise exception 'invoice status can''t change from % to %', old.status, new.status using errcode = 'KC004';
    end if;
    if new.status = 'void' and old.amount_paid_cents > 0 then
      raise exception 'invoice % has payments; record refunds before voiding it', old.invoice_number using errcode = 'KC004';
    end if;
  end if;

  if old.status = 'draft' and new.status = 'sent' then
    select count(*) into v_lines from public.invoice_line_items where invoice_id = old.id and not voided;
    if v_lines = 0 or new.total_cents <= 0 then
      raise exception 'add at least one line with an amount before sending' using errcode = 'KC004';
    end if;
    new.issued_on := coalesce(new.issued_on, v_today);
    new.sent_at := coalesce(new.sent_at, now());
    if new.due_on is null then
      raise exception 'set a due date before sending' using errcode = 'KC005';
    end if;
  end if;

  if new.status = 'void' and old.status <> 'void' then
    new.voided_at := coalesce(new.voided_at, now());
  end if;

  if old.status <> 'draft' and (
       new.contact_id, new.account_id, new.quote_id, new.discount_cents, new.deposit_cents, new.tax_rate_ppm,
       new.subtotal_cents, new.tax_cents, new.issued_on, new.due_on, new.pay_token
     ) is distinct from (
       old.contact_id, old.account_id, old.quote_id, old.discount_cents, old.deposit_cents, old.tax_rate_ppm,
       old.subtotal_cents, old.tax_cents, old.issued_on, old.due_on, old.pay_token
     ) then
    raise exception 'invoice % is no longer a draft; its amounts and dates are frozen', old.invoice_number using errcode = 'KC004';
  end if;
  return new;
end;
$$;
create trigger invoices_guard before update or delete on public.invoices
  for each row execute function private.guard_invoice();

-- Voiding releases the invoice's job lines.
create function private.void_invoice_lines()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.invoice_line_items set voided = true where invoice_id = new.id and not voided;
  return null;
end;
$$;
create trigger invoices_void_lines after update of status on public.invoices
  for each row when (new.status = 'void' and old.status is distinct from 'void')
  execute function private.void_invoice_lines();

-- Amount paid = received payments minus refunds on them. The status follows.
create or replace function private.recompute_invoice_paid()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
  v_paid bigint;
  v_today date := (now() at time zone 'America/New_York')::date;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.invoice_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.invoice_id end
  ], null)
  loop
    select coalesce(sum(p.amount_cents), 0) - coalesce(sum((select coalesce(sum(r.amount_cents), 0) from public.refunds r where r.payment_id = p.id)), 0)
    into v_paid
    from public.payments p where p.invoice_id = affected and p.status = 'succeeded';
    update public.invoices i
    set amount_paid_cents = v_paid,
        status = case
          when i.status in ('draft', 'void') then i.status
          when i.total_cents > 0 and v_paid >= i.total_cents then 'paid'::public.invoice_status
          when i.due_on is not null and i.due_on < v_today then 'overdue'::public.invoice_status
          when v_paid > 0 then 'partially_paid'::public.invoice_status
          else 'sent'::public.invoice_status end,
        paid_at = case
          when i.status in ('draft', 'void') then i.paid_at
          when i.total_cents > 0 and v_paid >= i.total_cents then coalesce(i.paid_at, now())
          else null end
    where i.id = affected;
  end loop;
  return null;
end;
$$;

-- A refund touches its payment, which re-runs the invoice recompute above.
create function private.touch_refunded_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.payments set updated_at = now() where id = new.payment_id;
  return null;
end;
$$;
create trigger refunds_touch_payment after insert on public.refunds
  for each row execute function private.touch_refunded_payment();
revoke execute on function private.recompute_invoice_subtotal(), private.guard_invoice_line(), private.guard_invoice(),
  private.void_invoice_lines(), private.recompute_invoice_paid(), private.touch_refunded_payment()
  from public, anon, authenticated;

alter table public.invoices add column void_reason text;

-- ---------------------------------------------------------------------------
-- Payouts: weekly, recorded (not sent), only for collected money
-- ---------------------------------------------------------------------------

-- A voided payout no longer blocks rebuilding its week.
alter table public.payouts drop constraint payouts_subcontractor_period_key;
create unique index payouts_live_period_key on public.payouts (subcontractor_id, period_start, period_end) where status <> 'void';

-- Paying is recorded: the method and reference of the Zelle/ACH/check made outside the app.
alter table public.payouts
  add column paid_method public.payment_method,
  add column paid_reference text;

-- Demo payouts that were already paid get a reference (their guard is
-- switched off for this one backfill only).
alter table public.payouts disable trigger payouts_guard_status;
update public.payouts
set paid_method = 'ach', paid_reference = coalesce(payout_vendor_ref, 'legacy')
where status = 'paid' and paid_reference is null;
alter table public.payouts enable trigger payouts_guard_status;
alter table public.payouts add constraint payouts_paid_has_reference check (
  status <> 'paid' or (paid_method is not null and paid_reference is not null and length(btrim(paid_reference)) > 0)
);

-- ---------------------------------------------------------------------------
-- W-9s: private bucket, owner/admin only (a W-9 holds a TIN)
-- ---------------------------------------------------------------------------

update storage.buckets
set file_size_limit = 10485760, allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'subcontractor-documents';

drop policy "subcontractor-documents: staff read" on storage.objects;
create policy "subcontractor-documents: read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'subcontractor-documents'
    and (
      (select private.is_admin())
      or ((select private.is_staff()) and exists (
        select 1 from public.subcontractor_documents d where d.storage_path = name and d.type <> 'w9'))
    )
  );

-- ---------------------------------------------------------------------------
-- Row security: read-only for signed-in users, writes only through functions
-- ---------------------------------------------------------------------------

drop policy "invoices: staff insert" on public.invoices;
drop policy "invoices: staff update" on public.invoices;
drop policy "invoices: admin delete" on public.invoices;
drop policy "invoice_line_items: staff insert" on public.invoice_line_items;
drop policy "invoice_line_items: staff update" on public.invoice_line_items;
drop policy "invoice_line_items: staff delete" on public.invoice_line_items;
drop policy "payments: admin insert" on public.payments;
drop policy "payments: admin update" on public.payments;
drop policy "payments: admin delete" on public.payments;
drop policy "payouts: admin insert" on public.payouts;
drop policy "payouts: admin update" on public.payouts;
drop policy "payouts: admin delete" on public.payouts;
drop policy "payout_items: admin insert" on public.payout_items;
drop policy "payout_items: admin update" on public.payout_items;
drop policy "payout_items: admin delete" on public.payout_items;
drop policy "subcontractor_documents: admin insert" on public.subcontractor_documents;
drop policy "subcontractor_documents: admin update" on public.subcontractor_documents;
drop policy "subcontractor_documents: admin delete" on public.subcontractor_documents;

alter table public.business_settings enable row level security;
alter table public.finance_log enable row level security;
alter table public.refunds enable row level security;
alter table public.payment_methods enable row level security;
alter table public.card_requests enable row level security;

create policy "business_settings: staff read" on public.business_settings for select to authenticated using ((select private.is_staff()));
create policy "finance_log: read" on public.finance_log for select to authenticated
  using ((select private.is_admin()) or ((select private.is_staff()) and entity in ('invoice', 'payment', 'refund', 'card')));
create policy "refunds: staff read" on public.refunds for select to authenticated using ((select private.is_staff()));
create policy "payment_methods: staff read" on public.payment_methods for select to authenticated using ((select private.is_staff()));
create policy "card_requests: admin read" on public.card_requests for select to authenticated using ((select private.is_admin()));

revoke all on public.business_settings, public.finance_log, public.refunds, public.payment_methods, public.card_requests from anon;
revoke insert, update, delete, truncate on
  public.invoices, public.invoice_line_items, public.payments, public.refunds, public.payouts, public.payout_items,
  public.subcontractor_documents, public.business_settings, public.finance_log, public.payment_methods, public.card_requests
  from authenticated;

-- ---------------------------------------------------------------------------
-- Functions (definer bodies in private; thin invoker wrappers in public)
-- ---------------------------------------------------------------------------

create function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only the owner or an admin can do this' using errcode = 'KC004';
  end if;
end;
$$;
revoke execute on function private.require_admin() from public, anon, authenticated;

-- Settings -------------------------------------------------------------------

create function private.update_business_settings(
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
  select * into v_old from public.business_settings;
  update public.business_settings
  set tax_rate_ppm = p_tax_rate_ppm, default_line_taxable = p_default_line_taxable,
      invoice_due_days = p_invoice_due_days, form_1099_threshold_cents = p_threshold_cents,
      form_1099_warn_bps = p_warn_bps, updated_by = (select auth.uid());
  perform private.log_finance('settings', null, 'updated', jsonb_build_object(
    'tax_rate_ppm', jsonb_build_array(v_old.tax_rate_ppm, p_tax_rate_ppm),
    'default_line_taxable', jsonb_build_array(v_old.default_line_taxable, p_default_line_taxable),
    'invoice_due_days', jsonb_build_array(v_old.invoice_due_days, p_invoice_due_days),
    'form_1099_threshold_cents', jsonb_build_array(v_old.form_1099_threshold_cents, p_threshold_cents),
    'form_1099_warn_bps', jsonb_build_array(v_old.form_1099_warn_bps, p_warn_bps)));
end;
$$;

-- Invoices ---------------------------------------------------------------------

create function private.create_invoice_from_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs%rowtype;
  v_set public.business_settings%rowtype;
  v_inv uuid;
  v_svc text;
  v_number bigint;
begin
  perform private.require_admin();
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'visit not found' using errcode = 'KC005';
  end if;
  if j.status <> 'completed' then
    raise exception 'only completed visits can be invoiced' using errcode = 'KC004';
  end if;
  select i.invoice_number into v_number
  from public.invoice_line_items li join public.invoices i on i.id = li.invoice_id
  where li.job_id = p_job_id and not li.voided;
  if found then
    raise exception 'this visit is already on invoice #%', v_number using errcode = 'KC010';
  end if;
  if j.quote_id is not null then
    select i.invoice_number into v_number from public.invoices i where i.quote_id = j.quote_id and i.status <> 'void';
    if found then
      raise exception 'this visit''s quote is already invoiced on invoice #%', v_number using errcode = 'KC010';
    end if;
  end if;
  select * into v_set from public.business_settings;
  select s.name into v_svc from public.services s where s.id = j.service_id;
  insert into public.invoices (contact_id, account_id, tax_rate_ppm, created_by)
  values (j.contact_id, j.account_id, v_set.tax_rate_ppm, (select auth.uid()))
  returning id into v_inv;
  insert into public.invoice_line_items (invoice_id, job_id, description, quantity, unit_price_cents, taxable, sort_order)
  values (v_inv, j.id, v_svc || ' – ' || to_char(j.scheduled_start at time zone 'America/New_York', 'Mon FMDD, YYYY'),
          1, j.price_cents, v_set.default_line_taxable, 0);
  perform private.log_finance('invoice', v_inv, 'created', jsonb_build_object('from', 'job', 'job_id', p_job_id));
  return v_inv;
end;
$$;

create function private.create_invoice_from_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes%rowtype;
  v_set public.business_settings%rowtype;
  v_inv uuid;
  v_number bigint;
begin
  perform private.require_admin();
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'quote not found' using errcode = 'KC005';
  end if;
  if q.status in ('declined', 'expired') then
    raise exception 'a % quote can''t be invoiced', q.status using errcode = 'KC004';
  end if;
  if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
    raise exception 'this quote has no line items' using errcode = 'KC004';
  end if;
  select i.invoice_number into v_number from public.invoices i where i.quote_id = p_quote_id and i.status <> 'void';
  if found then
    raise exception 'this quote is already on invoice #%', v_number using errcode = 'KC010';
  end if;
  select * into v_set from public.business_settings;
  insert into public.invoices (contact_id, account_id, quote_id, tax_rate_ppm, created_by)
  values (q.contact_id, q.account_id, p_quote_id, v_set.tax_rate_ppm, (select auth.uid()))
  returning id into v_inv;
  insert into public.invoice_line_items (invoice_id, description, quantity, unit_price_cents, taxable, sort_order)
  select v_inv, qi.description, qi.quantity, qi.unit_price_cents, v_set.default_line_taxable, qi.sort_order
  from public.quote_items qi where qi.quote_id = p_quote_id order by qi.sort_order, qi.created_at;
  update public.invoices i
  set discount_cents = least(q.discount_cents, i.subtotal_cents),
      tax_cents = private.calc_tax_cents(i.subtotal_cents,
        (select coalesce(sum(li.line_total_cents) filter (where li.taxable), 0) from public.invoice_line_items li where li.invoice_id = v_inv),
        least(q.discount_cents, i.subtotal_cents), i.tax_rate_ppm)
  where i.id = v_inv;
  perform private.log_finance('invoice', v_inv, 'created', jsonb_build_object('from', 'quote', 'quote_id', p_quote_id));
  return v_inv;
end;
$$;

-- Replaces a draft's lines and terms in one go. Lines are
-- [{description, quantity, unit_price_cents, taxable, job_id?}]; a job_id is kept
-- only if the draft already had that visit (you can't attach other visits here).
create function private.save_invoice(
  p_invoice_id uuid, p_expected_updated_at timestamptz, p_lines jsonb,
  p_discount_cents bigint, p_deposit_cents bigint, p_due_on date, p_notes text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
  v_line jsonb;
  v_i integer := 0;
  v_sub bigint := 0;
  v_taxable bigint;
  v_job uuid;
  v_kept uuid[];
  v_updated timestamptz;
begin
  perform private.require_admin();
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'KC005';
  end if;
  if v_inv.updated_at is distinct from p_expected_updated_at then
    raise exception 'this invoice was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'only a draft invoice can be edited' using errcode = 'KC004';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'an invoice needs between 1 and 100 lines' using errcode = 'KC005';
  end if;
  if p_discount_cents < 0 or p_deposit_cents < 0 or length(coalesce(p_notes, '')) > 2000 then
    raise exception 'check the discount, deposit and notes' using errcode = 'KC005';
  end if;
  select coalesce(array_agg(li.job_id), '{}') into v_kept
  from public.invoice_line_items li where li.invoice_id = p_invoice_id and li.job_id is not null and not li.voided;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line -> 'description') is distinct from 'string'
       or length(btrim(v_line ->> 'description')) not between 1 and 300
       or (v_line ->> 'quantity') !~ '^[0-9]{1,4}$' or (v_line ->> 'quantity')::integer < 1
       or (v_line ->> 'unit_price_cents') !~ '^[0-9]{1,9}$'
       or jsonb_typeof(v_line -> 'taxable') is distinct from 'boolean' then
      raise exception 'line % is not valid', v_i + 1 using errcode = 'KC005';
    end if;
    v_job := nullif(v_line ->> 'job_id', '')::uuid;
    if v_job is not null and not (v_job = any (v_kept)) then
      raise exception 'line % refers to a visit that isn''t on this invoice', v_i + 1 using errcode = 'KC005';
    end if;
    v_sub := v_sub + (v_line ->> 'quantity')::bigint * (v_line ->> 'unit_price_cents')::bigint;
    v_i := v_i + 1;
  end loop;
  if p_discount_cents > v_sub then
    raise exception 'the discount can''t be more than the subtotal' using errcode = 'KC005';
  end if;

  update public.invoices set discount_cents = 0, deposit_cents = 0 where id = p_invoice_id;
  delete from public.invoice_line_items where invoice_id = p_invoice_id;
  v_i := 0;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.invoice_line_items (invoice_id, job_id, description, quantity, unit_price_cents, taxable, sort_order)
    values (p_invoice_id, nullif(v_line ->> 'job_id', '')::uuid, btrim(v_line ->> 'description'),
            (v_line ->> 'quantity')::integer, (v_line ->> 'unit_price_cents')::bigint, (v_line ->> 'taxable')::boolean, v_i);
    v_i := v_i + 1;
  end loop;

  -- Discount and tax together in one statement; the deposit is set after, once the total is known.
  select coalesce(sum(li.line_total_cents) filter (where li.taxable), 0) into v_taxable
  from public.invoice_line_items li where li.invoice_id = p_invoice_id;
  update public.invoices
  set discount_cents = p_discount_cents, deposit_cents = 0,
      tax_cents = private.calc_tax_cents(v_sub, v_taxable, p_discount_cents, tax_rate_ppm)
  where id = p_invoice_id
  returning * into v_inv;
  if p_deposit_cents > v_inv.total_cents then
    raise exception 'the deposit can''t be more than the total' using errcode = 'KC005';
  end if;
  update public.invoices
  set deposit_cents = p_deposit_cents, due_on = p_due_on, notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_invoice_id
  returning updated_at into v_updated;
  perform private.log_finance('invoice', p_invoice_id, 'edited', jsonb_build_object('lines', v_i, 'total_cents', v_inv.total_cents));
  return v_updated;
end;
$$;

create function private.send_invoice(p_invoice_id uuid, p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
  v_days integer;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_updated timestamptz;
begin
  perform private.require_admin();
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'KC005';
  end if;
  if v_inv.updated_at is distinct from p_expected_updated_at then
    raise exception 'this invoice was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'invoice % has already been sent', v_inv.invoice_number using errcode = 'KC004';
  end if;
  select invoice_due_days into v_days from public.business_settings;
  update public.invoices
  set status = 'sent', issued_on = v_today, due_on = coalesce(due_on, v_today + v_days)
  where id = p_invoice_id
  returning updated_at into v_updated;
  perform private.log_finance('invoice', p_invoice_id, 'sent', jsonb_build_object('total_cents', v_inv.total_cents));
  return v_updated;
end;
$$;

create function private.void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
begin
  perform private.require_admin();
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'say briefly why this invoice is void' using errcode = 'KC005';
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'KC005';
  end if;
  update public.invoices set status = 'void', void_reason = btrim(p_reason) where id = p_invoice_id;
  perform private.log_finance('invoice', p_invoice_id, 'voided', jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create function private.delete_invoice_draft(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform 1 from public.invoices where id = p_invoice_id and status = 'draft' for update;
  if not found then
    raise exception 'only a draft invoice can be deleted' using errcode = 'KC004';
  end if;
  delete from public.invoices where id = p_invoice_id;
  perform private.log_finance('invoice', p_invoice_id, 'draft_deleted');
end;
$$;

create function private.record_manual_payment(
  p_invoice_id uuid, p_amount_cents bigint, p_method public.payment_method,
  p_reference text, p_received_on date, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
  v_id uuid;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_on date := coalesce(p_received_on, (now() at time zone 'America/New_York')::date);
begin
  perform private.require_admin();
  if p_request_id is not null then
    select id into v_id from public.payments where request_id = p_request_id;
    if found then
      return v_id;
    end if;
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'KC005';
  end if;
  if v_inv.status not in ('sent', 'partially_paid', 'overdue') then
    raise exception 'invoice % is % and can''t take a payment', v_inv.invoice_number, v_inv.status using errcode = 'KC004';
  end if;
  if p_method not in ('cash', 'zelle', 'check', 'ach', 'other') then
    raise exception 'manual payments are cash, Zelle, check, ACH or other (cards go through Stripe)' using errcode = 'KC005';
  end if;
  if p_method in ('zelle', 'check') and length(btrim(coalesce(p_reference, ''))) = 0 then
    raise exception 'enter the % reference', p_method using errcode = 'KC005';
  end if;
  if length(coalesce(p_reference, '')) > 200 then
    raise exception 'the reference is too long' using errcode = 'KC005';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount above zero' using errcode = 'KC005';
  end if;
  if p_amount_cents > v_inv.total_cents - v_inv.amount_paid_cents then
    raise exception 'that is more than the balance due' using errcode = 'KC005';
  end if;
  if v_on > v_today then
    raise exception 'the received date can''t be in the future' using errcode = 'KC005';
  end if;
  insert into public.payments (invoice_id, amount_cents, status, method, source, reference, recorded_by, request_id, received_at)
  values (p_invoice_id, p_amount_cents, 'succeeded', p_method, 'manual', nullif(btrim(coalesce(p_reference, '')), ''),
          (select auth.uid()), p_request_id, (v_on + time '12:00') at time zone 'America/New_York')
  returning id into v_id;
  perform private.log_finance('payment', v_id, 'recorded', jsonb_build_object(
    'invoice_id', p_invoice_id, 'amount_cents', p_amount_cents, 'method', p_method, 'reference', nullif(btrim(coalesce(p_reference, '')), '')));
  return v_id;
end;
$$;

create function private.record_refund(p_payment_id uuid, p_amount_cents bigint, p_reason text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_invoice uuid;
begin
  perform private.require_admin();
  if p_request_id is not null then
    select id into v_id from public.refunds where request_id = p_request_id;
    if found then
      return v_id;
    end if;
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'enter an amount above zero' using errcode = 'KC005';
  end if;
  if length(coalesce(p_reason, '')) > 500 then
    raise exception 'the reason is too long' using errcode = 'KC005';
  end if;
  select invoice_id into v_invoice from public.payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found' using errcode = 'KC005';
  end if;
  insert into public.refunds (payment_id, amount_cents, reason, source, request_id, recorded_by)
  values (p_payment_id, p_amount_cents, nullif(btrim(coalesce(p_reason, '')), ''), 'manual', p_request_id, (select auth.uid()))
  returning id into v_id;
  perform private.log_finance('refund', v_id, 'recorded', jsonb_build_object(
    'invoice_id', v_invoice, 'payment_id', p_payment_id, 'amount_cents', p_amount_cents));
  return v_id;
end;
$$;

create function private.mark_invoice_collected(p_invoice_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices%rowtype;
begin
  perform private.require_admin();
  if p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 500 then
    raise exception 'say how the money was collected' using errcode = 'KC005';
  end if;
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'KC005';
  end if;
  if v_inv.status in ('draft', 'void') then
    raise exception 'a % invoice can''t be marked collected', v_inv.status using errcode = 'KC004';
  end if;
  update public.invoices set collected_at = now(), collected_by = (select auth.uid()), collected_note = btrim(p_note)
  where id = p_invoice_id;
  perform private.log_finance('invoice', p_invoice_id, 'marked_collected', jsonb_build_object('note', btrim(p_note)));
end;
$$;

create function private.clear_invoice_collected(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if exists (
    select 1
    from public.invoice_line_items li
    join public.job_assignments a on a.job_id = li.job_id
    join public.payout_items pi on pi.job_assignment_id = a.id and not pi.voided
    join public.payouts po on po.id = pi.payout_id
    where li.invoice_id = p_invoice_id and po.status in ('approved', 'paid')
  ) then
    raise exception 'a payout that includes this invoice is already approved' using errcode = 'KC004';
  end if;
  update public.invoices set collected_at = null, collected_by = null, collected_note = null
  where id = p_invoice_id and collected_at is not null;
  perform private.log_finance('invoice', p_invoice_id, 'collected_cleared');
end;
$$;

-- Cards on file -----------------------------------------------------------------------

create function private.create_card_request(p_contact_id uuid, p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid;
begin
  perform private.require_admin();
  if num_nonnulls(p_contact_id, p_account_id) < 1 then
    raise exception 'pick a customer' using errcode = 'KC005';
  end if;
  insert into public.card_requests (contact_id, account_id, created_by)
  values (p_contact_id, p_account_id, (select auth.uid()))
  returning id, token into v_id, v_token;
  perform private.log_finance('card', v_id, 'link_created', jsonb_build_object('contact_id', p_contact_id, 'account_id', p_account_id));
  return v_token;
end;
$$;

create function private.remove_payment_method(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stripe text;
begin
  perform private.require_admin();
  delete from public.payment_methods where id = p_id returning stripe_payment_method_id into v_stripe;
  if not found then
    raise exception 'card not found' using errcode = 'KC005';
  end if;
  perform private.log_finance('card', p_id, 'removed');
  return v_stripe;
end;
$$;

-- Payouts ---------------------------------------------------------------------------

-- Every completed visit's pay line with the reason it can't be paid out yet
-- (null = eligible). Pay is the snapshot on the assignment. p_week_start is the
-- week being built or approved: visits sitting in a draft for another week wait.
create function private.payout_core(p_week_start date)
returns table (
  assignment_id uuid, subcontractor_id uuid, subcontractor_name text, job_id uuid, completed_on date,
  service_name text, client_name text, pay_cents bigint, invoice_id uuid, invoice_number bigint,
  invoice_status public.invoice_status, invoice_balance_cents bigint, invoice_collected boolean,
  payout_id uuid, payout_status public.payout_status, payout_period_start date, reason_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.subcontractor_id, s.display_name, j.id,
         (j.completed_at at time zone 'America/New_York')::date,
         sv.name,
         coalesce(nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), ac.name),
         a.pay_cents, inv.id, inv.invoice_number, inv.status,
         greatest(inv.total_cents - inv.amount_paid_cents, 0), (inv.collected_at is not null),
         po.id, po.status, po.period_start,
         case
           when a.pay_cents is null then 'pay_pending'
           when po.status in ('approved', 'paid') then 'already_paid'
           when po.status = 'draft' and (p_week_start is null or po.period_start <> p_week_start) then 'in_other_draft'
           when inv.id is null then 'no_invoice'
           when inv.status = 'draft' then 'invoice_draft'
           when inv.status = 'paid' or inv.collected_at is not null then null
           when inv.amount_paid_cents > 0 then 'invoice_partial'
           else 'invoice_unpaid' end
  from public.job_assignments a
  join public.jobs j on j.id = a.job_id and j.status = 'completed' and j.completed_at is not null
  join public.subcontractors s on s.id = a.subcontractor_id
  join public.services sv on sv.id = j.service_id
  left join public.contacts c on c.id = j.contact_id
  left join public.accounts ac on ac.id = j.account_id
  left join lateral (
    select i.id, i.invoice_number, i.status, i.total_cents, i.amount_paid_cents, i.collected_at
    from public.invoice_line_items li join public.invoices i on i.id = li.invoice_id
    where li.job_id = j.id and not li.voided
    limit 1
  ) inv on true
  left join public.payout_items pi on pi.job_assignment_id = a.id and not pi.voided
  left join public.payouts po on po.id = pi.payout_id
$$;
revoke execute on function private.payout_core(date) from public, anon, authenticated;

create function private.payout_candidates(p_week_start date default null, p_subcontractor_id uuid default null)
returns table (
  assignment_id uuid, subcontractor_id uuid, subcontractor_name text, job_id uuid, completed_on date,
  service_name text, client_name text, pay_cents bigint, invoice_id uuid, invoice_number bigint,
  invoice_status public.invoice_status, invoice_balance_cents bigint, invoice_collected boolean,
  payout_id uuid, payout_status public.payout_status, reason_code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select c.assignment_id, c.subcontractor_id, c.subcontractor_name, c.job_id, c.completed_on, c.service_name, c.client_name,
         c.pay_cents, c.invoice_id, c.invoice_number, c.invoice_status, c.invoice_balance_cents, c.invoice_collected,
         c.payout_id, c.payout_status, c.reason_code
  from private.payout_core(p_week_start) c
  where c.reason_code is distinct from 'already_paid'
    and (p_week_start is null or c.completed_on <= p_week_start + 6)
    and (p_subcontractor_id is null or c.subcontractor_id = p_subcontractor_id)
  order by c.subcontractor_name, c.completed_on, c.assignment_id;
end;
$$;

create function private.build_payout_drafts(p_week_start date, p_subcontractor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end date := p_week_start + 6;
  v_today date := (now() at time zone 'America/New_York')::date;
  r record;
  po public.payouts%rowtype;
  v_id uuid;
  v_built integer := 0;
  v_skipped integer := 0;
  v_handled uuid[] := '{}';
begin
  perform private.require_admin();
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'a payout week starts on a Monday' using errcode = 'KC005';
  end if;
  if p_week_start > v_today then
    raise exception 'that week hasn''t started yet' using errcode = 'KC005';
  end if;

  for r in
    select distinct c.subcontractor_id
    from private.payout_core(p_week_start) c
    where c.reason_code is null and c.completed_on <= v_end
      and (p_subcontractor_id is null or c.subcontractor_id = p_subcontractor_id)
  loop
    v_handled := v_handled || r.subcontractor_id;
    select * into po from public.payouts
    where subcontractor_id = r.subcontractor_id and period_start = p_week_start and period_end = v_end and status <> 'void'
    for update;
    if found and po.status <> 'draft' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if not found then
      insert into public.payouts (subcontractor_id, period_start, period_end)
      values (r.subcontractor_id, p_week_start, v_end) returning id into v_id;
    else
      v_id := po.id;
    end if;
    delete from public.payout_items where payout_id = v_id;
    insert into public.payout_items (payout_id, job_assignment_id, amount_cents)
    select v_id, c.assignment_id, c.pay_cents
    from private.payout_core(p_week_start) c
    where c.subcontractor_id = r.subcontractor_id and c.reason_code is null and c.completed_on <= v_end;
    v_built := v_built + 1;
  end loop;

  -- Drafts for the week whose subcontractor no longer has anything eligible.
  delete from public.payout_items pi
  using public.payouts p
  where pi.payout_id = p.id and p.status = 'draft' and p.period_start = p_week_start
    and not (p.subcontractor_id = any (v_handled))
    and (p_subcontractor_id is null or p.subcontractor_id = p_subcontractor_id);
  delete from public.payouts p
  where p.status = 'draft' and p.period_start = p_week_start
    and not (p.subcontractor_id = any (v_handled))
    and (p_subcontractor_id is null or p.subcontractor_id = p_subcontractor_id);

  perform private.log_finance('payout', null, 'built', jsonb_build_object('week_start', p_week_start, 'built', v_built, 'skipped', v_skipped));
  return jsonb_build_object('week_start', p_week_start, 'built', v_built, 'skipped', v_skipped);
end;
$$;

create function private.approve_payout(p_payout_id uuid, p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  po public.payouts%rowtype;
  v_bad integer;
  v_changed integer;
  v_items integer;
  v_updated timestamptz;
begin
  perform private.require_admin();
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    raise exception 'payout not found' using errcode = 'KC005';
  end if;
  if po.updated_at is distinct from p_expected_updated_at then
    raise exception 'this payout was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if po.status <> 'draft' then
    raise exception 'only a draft payout can be approved' using errcode = 'KC004';
  end if;
  select count(*) into v_items from public.payout_items where payout_id = p_payout_id;
  if v_items = 0 or po.total_cents <= 0 then
    raise exception 'there is nothing to pay on this payout' using errcode = 'KC004';
  end if;
  -- Re-check at approval: an invoice may have been refunded or voided, or pay edited, since the draft was built.
  select count(*) into v_bad
  from public.payout_items pi
  join private.payout_core(po.period_start) c on c.assignment_id = pi.job_assignment_id
  where pi.payout_id = p_payout_id and c.reason_code is not null;
  select count(*) into v_changed
  from public.payout_items pi
  join public.job_assignments a on a.id = pi.job_assignment_id
  where pi.payout_id = p_payout_id and a.pay_cents is distinct from pi.amount_cents;
  if v_bad > 0 or v_changed > 0 then
    raise exception '% visit(s) on this payout no longer qualify or changed pay; rebuild the week', v_bad + v_changed using errcode = 'KC004';
  end if;
  update public.payouts set status = 'approved' where id = p_payout_id returning updated_at into v_updated;
  perform private.log_finance('payout', p_payout_id, 'approved', jsonb_build_object('total_cents', po.total_cents, 'visits', v_items));
  return v_updated;
end;
$$;

create function private.reopen_payout(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform 1 from public.payouts where id = p_payout_id and status = 'approved' for update;
  if not found then
    raise exception 'only an approved payout can be reopened' using errcode = 'KC004';
  end if;
  update public.payouts set status = 'draft' where id = p_payout_id;
  perform private.log_finance('payout', p_payout_id, 'reopened');
end;
$$;

create function private.mark_payout_paid(p_payout_id uuid, p_method public.payment_method, p_reference text, p_paid_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_on date := coalesce(p_paid_on, (now() at time zone 'America/New_York')::date);
  v_total bigint;
begin
  perform private.require_admin();
  if p_method not in ('zelle', 'ach', 'check', 'cash', 'other') then
    raise exception 'pay by Zelle, ACH, check, cash or other' using errcode = 'KC005';
  end if;
  if p_reference is null or length(btrim(p_reference)) = 0 or length(p_reference) > 200 then
    raise exception 'enter the payment reference (confirmation number, check number)' using errcode = 'KC005';
  end if;
  if v_on > v_today then
    raise exception 'the paid date can''t be in the future' using errcode = 'KC005';
  end if;
  select total_cents into v_total from public.payouts where id = p_payout_id and status = 'approved' for update;
  if not found then
    raise exception 'only an approved payout can be marked paid' using errcode = 'KC004';
  end if;
  update public.payouts
  set status = 'paid', paid_method = p_method, paid_reference = btrim(p_reference),
      paid_at = (v_on + time '12:00') at time zone 'America/New_York'
  where id = p_payout_id;
  perform private.log_finance('payout', p_payout_id, 'paid', jsonb_build_object(
    'total_cents', v_total, 'method', p_method, 'reference', btrim(p_reference), 'paid_on', v_on));
end;
$$;

create function private.void_payout(p_payout_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 500 then
    raise exception 'say briefly why this payout is void' using errcode = 'KC005';
  end if;
  perform 1 from public.payouts where id = p_payout_id and status in ('approved', 'paid') for update;
  if not found then
    raise exception 'only an approved or paid payout can be voided' using errcode = 'KC004';
  end if;
  update public.payouts set status = 'void', void_reason = btrim(p_reason) where id = p_payout_id;
  perform private.log_finance('payout', p_payout_id, 'voided', jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create function private.delete_payout_draft(p_payout_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform 1 from public.payouts where id = p_payout_id and status = 'draft' for update;
  if not found then
    raise exception 'only a draft payout can be deleted' using errcode = 'KC004';
  end if;
  delete from public.payout_items where payout_id = p_payout_id;
  delete from public.payouts where id = p_payout_id;
  perform private.log_finance('payout', p_payout_id, 'draft_deleted');
end;
$$;

-- 1099 tracking and W-9s ---------------------------------------------------------

-- Per subcontractor for a calendar year (New York dates): what was marked
-- paid, what is approved but unpaid, and whether a W-9 is on file. The app
-- compares paid_cents with the threshold setting.
create function private.contractor_1099_summary(p_year integer)
returns table (
  subcontractor_id uuid, display_name text, legal_name text, business_entity public.business_entity,
  status public.subcontractor_status, w9_received_at timestamptz, paid_cents bigint,
  approved_cents bigint, payout_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_year not between 2000 and 2200 then
    raise exception 'pick a valid year' using errcode = 'KC005';
  end if;
  return query
  select s.id, s.display_name, s.legal_name, s.business_entity, s.status, s.w9_received_at,
         coalesce(sum(po.total_cents) filter (where po.status = 'paid'
           and extract(year from po.paid_at at time zone 'America/New_York') = p_year), 0)::bigint,
         coalesce(sum(po.total_cents) filter (where po.status = 'approved'), 0)::bigint,
         count(po.id) filter (where po.status = 'paid'
           and extract(year from po.paid_at at time zone 'America/New_York') = p_year)
  from public.subcontractors s
  left join public.payouts po on po.subcontractor_id = s.id
  group by s.id
  order by s.display_name;
end;
$$;

create function private.record_w9(p_subcontractor_id uuid, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_admin();
  if p_storage_path is null or p_storage_path not like p_subcontractor_id::text || '/%' then
    raise exception 'the file must be stored under this subcontractor' using errcode = 'KC005';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'subcontractor-documents' and o.name = p_storage_path) then
    raise exception 'the uploaded file wasn''t found' using errcode = 'KC005';
  end if;
  insert into public.subcontractor_documents (subcontractor_id, type, storage_path, uploaded_by)
  values (p_subcontractor_id, 'w9', p_storage_path, (select auth.uid()))
  returning id into v_id;
  update public.subcontractors set w9_received_at = now() where id = p_subcontractor_id;
  perform private.log_finance('document', v_id, 'w9_recorded', jsonb_build_object('subcontractor_id', p_subcontractor_id));
  return v_id;
end;
$$;

-- Returns the storage path so the caller can delete the file too.
create function private.remove_subcontractor_document(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
  v_sub uuid;
  v_type public.subcontractor_document_type;
begin
  perform private.require_admin();
  delete from public.subcontractor_documents where id = p_id returning storage_path, subcontractor_id, type into v_path, v_sub, v_type;
  if not found then
    raise exception 'document not found' using errcode = 'KC005';
  end if;
  if v_type = 'w9' and not exists (select 1 from public.subcontractor_documents d where d.subcontractor_id = v_sub and d.type = 'w9') then
    update public.subcontractors set w9_received_at = null where id = v_sub;
  end if;
  perform private.log_finance('document', p_id, 'removed', jsonb_build_object('subcontractor_id', v_sub, 'type', v_type));
  return v_path;
end;
$$;

-- Finance view ------------------------------------------------------------------------

-- Months are New York calendar months, newest last. Revenue is what was
-- invoiced (sent or later, not void); collected is payments received minus
-- refunds; outstanding is what is still unpaid on that month's invoices;
-- payouts are batches marked paid. Margin is cash-basis: collected - payouts.
-- Payouts and margin are null for non-admins.
create function private.finance_summary(p_months integer default 6)
returns table (month_start date, revenue_cents bigint, collected_cents bigint, outstanding_cents bigint, payouts_cents bigint, margin_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := private.is_admin();
  v_first date := (date_trunc('month', now() at time zone 'America/New_York') - make_interval(months => greatest(p_months, 1) - 1))::date;
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  return query
  with months as (
    select m::date as ms from generate_series(v_first, (date_trunc('month', now() at time zone 'America/New_York'))::date, interval '1 month') m
  ),
  rev as (
    select date_trunc('month', i.issued_on)::date as ms, sum(i.total_cents) as revenue, sum(greatest(i.total_cents - i.amount_paid_cents, 0)) as outstanding
    from public.invoices i where i.status not in ('draft', 'void') and i.issued_on is not null group by 1
  ),
  pay as (
    select date_trunc('month', p.received_at at time zone 'America/New_York')::date as ms, sum(p.amount_cents) as amt
    from public.payments p where p.status = 'succeeded' and p.received_at is not null group by 1
  ),
  ref as (
    select date_trunc('month', r.created_at at time zone 'America/New_York')::date as ms, sum(r.amount_cents) as amt
    from public.refunds r group by 1
  ),
  out as (
    select date_trunc('month', po.paid_at at time zone 'America/New_York')::date as ms, sum(po.total_cents) as amt
    from public.payouts po where po.status = 'paid' and v_admin group by 1
  )
  select m.ms,
         coalesce(rev.revenue, 0)::bigint,
         (coalesce(pay.amt, 0) - coalesce(ref.amt, 0))::bigint,
         coalesce(rev.outstanding, 0)::bigint,
         case when v_admin then coalesce(out.amt, 0)::bigint end,
         case when v_admin then (coalesce(pay.amt, 0) - coalesce(ref.amt, 0) - coalesce(out.amt, 0))::bigint end
  from months m
  left join rev on rev.ms = m.ms
  left join pay on pay.ms = m.ms
  left join ref on ref.ms = m.ms
  left join out on out.ms = m.ms
  order by m.ms;
end;
$$;

-- What a cleaner may see of their own pay: approved and paid weeks only, as
-- date, service and amount per visit. No client names, invoices or other cleaners.
create function private.crew_payouts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub uuid := private.current_subcontractor_id();
  v_year integer := extract(year from now() at time zone 'America/New_York');
begin
  if v_sub is null then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  return jsonb_build_object(
    'ytd_paid_cents', coalesce((
      select sum(po.total_cents) from public.payouts po
      where po.subcontractor_id = v_sub and po.status = 'paid'
        and extract(year from po.paid_at at time zone 'America/New_York') = v_year), 0),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_start', po.period_start, 'period_end', po.period_end, 'status', po.status,
        'total_cents', po.total_cents, 'paid_at', po.paid_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'job_date', (j.scheduled_start at time zone 'America/New_York')::date,
            'service', sv.name, 'amount_cents', pi.amount_cents) order by j.scheduled_start)
          from public.payout_items pi
          join public.job_assignments a on a.id = pi.job_assignment_id
          join public.jobs j on j.id = a.job_id
          join public.services sv on sv.id = j.service_id
          where pi.payout_id = po.id and not pi.voided), '[]'::jsonb)
      ) order by po.period_start desc)
      from public.payouts po
      where po.subcontractor_id = v_sub and po.status in ('approved', 'paid')), '[]'::jsonb));
end;
$$;

-- Wrappers: callable by signed-in users; the private bodies do the role checks.
create function public.update_business_settings(p_tax_rate_ppm integer, p_default_line_taxable boolean, p_invoice_due_days integer, p_threshold_cents bigint, p_warn_bps integer)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.update_business_settings(p_tax_rate_ppm, p_default_line_taxable, p_invoice_due_days, p_threshold_cents, p_warn_bps) $$;
create function public.create_invoice_from_job(p_job_id uuid)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.create_invoice_from_job(p_job_id) $$;
create function public.create_invoice_from_quote(p_quote_id uuid)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.create_invoice_from_quote(p_quote_id) $$;
create function public.save_invoice(p_invoice_id uuid, p_expected_updated_at timestamptz, p_lines jsonb, p_discount_cents bigint, p_deposit_cents bigint, p_due_on date, p_notes text)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.save_invoice(p_invoice_id, p_expected_updated_at, p_lines, p_discount_cents, p_deposit_cents, p_due_on, p_notes) $$;
create function public.send_invoice(p_invoice_id uuid, p_expected_updated_at timestamptz)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.send_invoice(p_invoice_id, p_expected_updated_at) $$;
create function public.void_invoice(p_invoice_id uuid, p_reason text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.void_invoice(p_invoice_id, p_reason) $$;
create function public.delete_invoice_draft(p_invoice_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_invoice_draft(p_invoice_id) $$;
create function public.record_manual_payment(p_invoice_id uuid, p_amount_cents bigint, p_method public.payment_method, p_reference text, p_received_on date, p_request_id uuid)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_manual_payment(p_invoice_id, p_amount_cents, p_method, p_reference, p_received_on, p_request_id) $$;
create function public.record_refund(p_payment_id uuid, p_amount_cents bigint, p_reason text, p_request_id uuid)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_refund(p_payment_id, p_amount_cents, p_reason, p_request_id) $$;
create function public.mark_invoice_collected(p_invoice_id uuid, p_note text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.mark_invoice_collected(p_invoice_id, p_note) $$;
create function public.clear_invoice_collected(p_invoice_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.clear_invoice_collected(p_invoice_id) $$;
create function public.create_card_request(p_contact_id uuid, p_account_id uuid)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.create_card_request(p_contact_id, p_account_id) $$;
create function public.remove_payment_method(p_id uuid)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.remove_payment_method(p_id) $$;
create function public.payout_candidates(p_week_start date default null, p_subcontractor_id uuid default null)
returns table (
  assignment_id uuid, subcontractor_id uuid, subcontractor_name text, job_id uuid, completed_on date,
  service_name text, client_name text, pay_cents bigint, invoice_id uuid, invoice_number bigint,
  invoice_status public.invoice_status, invoice_balance_cents bigint, invoice_collected boolean,
  payout_id uuid, payout_status public.payout_status, reason_code text)
language sql stable security invoker set search_path = ''
as $$ select * from private.payout_candidates(p_week_start, p_subcontractor_id) $$;
create function public.build_payout_drafts(p_week_start date, p_subcontractor_id uuid default null)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.build_payout_drafts(p_week_start, p_subcontractor_id) $$;
create function public.approve_payout(p_payout_id uuid, p_expected_updated_at timestamptz)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.approve_payout(p_payout_id, p_expected_updated_at) $$;
create function public.reopen_payout(p_payout_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.reopen_payout(p_payout_id) $$;
create function public.mark_payout_paid(p_payout_id uuid, p_method public.payment_method, p_reference text, p_paid_on date)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.mark_payout_paid(p_payout_id, p_method, p_reference, p_paid_on) $$;
create function public.void_payout(p_payout_id uuid, p_reason text)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.void_payout(p_payout_id, p_reason) $$;
create function public.delete_payout_draft(p_payout_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_payout_draft(p_payout_id) $$;
create function public.contractor_1099_summary(p_year integer)
returns table (
  subcontractor_id uuid, display_name text, legal_name text, business_entity public.business_entity,
  status public.subcontractor_status, w9_received_at timestamptz, paid_cents bigint,
  approved_cents bigint, payout_count bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.contractor_1099_summary(p_year) $$;
create function public.record_w9(p_subcontractor_id uuid, p_storage_path text)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_w9(p_subcontractor_id, p_storage_path) $$;
create function public.remove_subcontractor_document(p_id uuid)
returns text language sql volatile security invoker set search_path = ''
as $$ select private.remove_subcontractor_document(p_id) $$;
create function public.finance_summary(p_months integer default 6)
returns table (month_start date, revenue_cents bigint, collected_cents bigint, outstanding_cents bigint, payouts_cents bigint, margin_cents bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.finance_summary(p_months) $$;
create function public.crew_payouts()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.crew_payouts() $$;

revoke execute on function
  private.update_business_settings(integer, boolean, integer, bigint, integer),
  private.create_invoice_from_job(uuid), private.create_invoice_from_quote(uuid),
  private.save_invoice(uuid, timestamptz, jsonb, bigint, bigint, date, text),
  private.send_invoice(uuid, timestamptz), private.void_invoice(uuid, text), private.delete_invoice_draft(uuid),
  private.record_manual_payment(uuid, bigint, public.payment_method, text, date, uuid),
  private.record_refund(uuid, bigint, text, uuid), private.mark_invoice_collected(uuid, text),
  private.clear_invoice_collected(uuid), private.create_card_request(uuid, uuid), private.remove_payment_method(uuid),
  private.payout_candidates(date, uuid), private.build_payout_drafts(date, uuid), private.approve_payout(uuid, timestamptz),
  private.reopen_payout(uuid), private.mark_payout_paid(uuid, public.payment_method, text, date),
  private.void_payout(uuid, text), private.delete_payout_draft(uuid), private.contractor_1099_summary(integer),
  private.record_w9(uuid, text), private.remove_subcontractor_document(uuid), private.finance_summary(integer),
  private.crew_payouts()
  from public, anon;
grant execute on function
  private.update_business_settings(integer, boolean, integer, bigint, integer),
  private.create_invoice_from_job(uuid), private.create_invoice_from_quote(uuid),
  private.save_invoice(uuid, timestamptz, jsonb, bigint, bigint, date, text),
  private.send_invoice(uuid, timestamptz), private.void_invoice(uuid, text), private.delete_invoice_draft(uuid),
  private.record_manual_payment(uuid, bigint, public.payment_method, text, date, uuid),
  private.record_refund(uuid, bigint, text, uuid), private.mark_invoice_collected(uuid, text),
  private.clear_invoice_collected(uuid), private.create_card_request(uuid, uuid), private.remove_payment_method(uuid),
  private.payout_candidates(date, uuid), private.build_payout_drafts(date, uuid), private.approve_payout(uuid, timestamptz),
  private.reopen_payout(uuid), private.mark_payout_paid(uuid, public.payment_method, text, date),
  private.void_payout(uuid, text), private.delete_payout_draft(uuid), private.contractor_1099_summary(integer),
  private.record_w9(uuid, text), private.remove_subcontractor_document(uuid), private.finance_summary(integer),
  private.crew_payouts()
  to authenticated;
revoke execute on function
  public.update_business_settings(integer, boolean, integer, bigint, integer),
  public.create_invoice_from_job(uuid), public.create_invoice_from_quote(uuid),
  public.save_invoice(uuid, timestamptz, jsonb, bigint, bigint, date, text),
  public.send_invoice(uuid, timestamptz), public.void_invoice(uuid, text), public.delete_invoice_draft(uuid),
  public.record_manual_payment(uuid, bigint, public.payment_method, text, date, uuid),
  public.record_refund(uuid, bigint, text, uuid), public.mark_invoice_collected(uuid, text),
  public.clear_invoice_collected(uuid), public.create_card_request(uuid, uuid), public.remove_payment_method(uuid),
  public.payout_candidates(date, uuid), public.build_payout_drafts(date, uuid), public.approve_payout(uuid, timestamptz),
  public.reopen_payout(uuid), public.mark_payout_paid(uuid, public.payment_method, text, date),
  public.void_payout(uuid, text), public.delete_payout_draft(uuid), public.contractor_1099_summary(integer),
  public.record_w9(uuid, text), public.remove_subcontractor_document(uuid), public.finance_summary(integer),
  public.crew_payouts()
  from public, anon;
grant execute on function
  public.update_business_settings(integer, boolean, integer, bigint, integer),
  public.create_invoice_from_job(uuid), public.create_invoice_from_quote(uuid),
  public.save_invoice(uuid, timestamptz, jsonb, bigint, bigint, date, text),
  public.send_invoice(uuid, timestamptz), public.void_invoice(uuid, text), public.delete_invoice_draft(uuid),
  public.record_manual_payment(uuid, bigint, public.payment_method, text, date, uuid),
  public.record_refund(uuid, bigint, text, uuid), public.mark_invoice_collected(uuid, text),
  public.clear_invoice_collected(uuid), public.create_card_request(uuid, uuid), public.remove_payment_method(uuid),
  public.payout_candidates(date, uuid), public.build_payout_drafts(date, uuid), public.approve_payout(uuid, timestamptz),
  public.reopen_payout(uuid), public.mark_payout_paid(uuid, public.payment_method, text, date),
  public.void_payout(uuid, text), public.delete_payout_draft(uuid), public.contractor_1099_summary(integer),
  public.record_w9(uuid, text), public.remove_subcontractor_document(uuid), public.finance_summary(integer),
  public.crew_payouts()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Server-only functions: Stripe webhooks, the overdue cron and the public
-- pay / card pages. Granted to the service role only; each is idempotent.
-- ---------------------------------------------------------------------------

create function public.stripe_record_payment(
  p_invoice_id uuid, p_amount_cents bigint, p_payment_intent text, p_charge text, p_checkout_session text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_inserted boolean;
  v_status public.invoice_status;
begin
  if p_payment_intent is null or length(p_payment_intent) = 0 or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment needs an intent id and a positive amount' using errcode = 'KC005';
  end if;
  perform 1 from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'KC005';
  end if;
  insert into public.payments (invoice_id, amount_cents, status, method, source, stripe_payment_intent_id, stripe_charge_id, stripe_checkout_session_id, received_at)
  values (p_invoice_id, p_amount_cents, 'succeeded', 'card', 'stripe', p_payment_intent, p_charge, p_checkout_session, now())
  on conflict (stripe_payment_intent_id) do update
    set stripe_charge_id = coalesce(public.payments.stripe_charge_id, excluded.stripe_charge_id),
        stripe_checkout_session_id = coalesce(public.payments.stripe_checkout_session_id, excluded.stripe_checkout_session_id)
  returning id, (xmax = 0) into v_id, v_inserted;
  select status into v_status from public.invoices where id = p_invoice_id;
  if v_inserted then
    perform private.log_finance('payment', v_id, 'stripe_payment', jsonb_build_object(
      'invoice_id', p_invoice_id, 'amount_cents', p_amount_cents, 'invoice_status', v_status));
  end if;
  return jsonb_build_object('payment_id', v_id, 'duplicate', not v_inserted, 'invoice_status', v_status);
end;
$$;

create function public.stripe_record_refund(p_payment_intent text, p_refund_id text, p_amount_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment uuid;
  v_id uuid;
begin
  select id into v_payment from public.payments where stripe_payment_intent_id = p_payment_intent;
  if not found then
    -- The payment event may arrive after the refund event: fail so Stripe retries.
    raise exception 'no payment recorded yet for this refund' using errcode = 'KC005';
  end if;
  insert into public.refunds (payment_id, amount_cents, source, stripe_refund_id)
  values (v_payment, p_amount_cents, 'stripe', p_refund_id)
  on conflict (stripe_refund_id) do nothing
  returning id into v_id;
  if v_id is not null then
    perform private.log_finance('refund', v_id, 'stripe_refund', jsonb_build_object('payment_id', v_payment, 'amount_cents', p_amount_cents));
  end if;
  return jsonb_build_object('refund_id', v_id, 'duplicate', v_id is null);
end;
$$;

create function public.stripe_save_card(
  p_contact_id uuid, p_account_id uuid, p_customer_id text, p_payment_method_id text,
  p_brand text, p_last4 text, p_exp_month integer, p_exp_year integer, p_card_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_has_default boolean;
begin
  if num_nonnulls(p_contact_id, p_account_id) < 1 then
    raise exception 'a card belongs to a customer' using errcode = 'KC005';
  end if;
  if p_contact_id is not null then
    update public.contacts set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id) where id = p_contact_id;
  end if;
  if p_account_id is not null then
    update public.accounts set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id) where id = p_account_id;
  end if;
  select exists (
    select 1 from public.payment_methods m
    where m.is_default and ((p_account_id is not null and m.account_id = p_account_id) or (p_contact_id is not null and m.contact_id = p_contact_id))
  ) into v_has_default;
  insert into public.payment_methods (contact_id, account_id, stripe_payment_method_id, brand, last4, exp_month, exp_year, is_default)
  values (p_contact_id, p_account_id, p_payment_method_id, p_brand, p_last4, p_exp_month, p_exp_year, not v_has_default)
  on conflict (stripe_payment_method_id) do update set brand = excluded.brand, last4 = excluded.last4,
    exp_month = excluded.exp_month, exp_year = excluded.exp_year
  returning id into v_id;
  if p_card_request_id is not null then
    update public.card_requests set used_at = coalesce(used_at, now()) where id = p_card_request_id;
  end if;
  perform private.log_finance('card', v_id, 'saved', jsonb_build_object('contact_id', p_contact_id, 'account_id', p_account_id));
  return v_id;
end;
$$;

-- Remembers the Stripe customer created for a pay-page or card-link checkout.
create function public.stripe_link_customer(p_contact_id uuid, p_account_id uuid, p_customer_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_contact_id is not null then
    update public.contacts set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id) where id = p_contact_id;
  end if;
  if p_account_id is not null then
    update public.accounts set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id) where id = p_account_id;
  end if;
end;
$$;

create function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_ids uuid[];
begin
  with u as (
    update public.invoices set status = 'overdue'
    where status in ('sent', 'partially_paid') and due_on is not null and due_on < v_today
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  if cardinality(v_ids) > 0 then
    insert into public.finance_log (entity, entity_id, action, detail)
    select 'invoice', x, 'marked_overdue', jsonb_build_object('as_of', v_today) from unnest(v_ids) x;
  end if;
  return cardinality(v_ids);
end;
$$;

-- What the public pay page may show: no phone, email or address.
create function public.invoice_for_pay_token(p_token text)
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

create function public.card_request_for_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'contact_id', r.contact_id, 'account_id', r.account_id,
    'customer', coalesce(c.first_name, ac.name),
    'stripe_customer_id', coalesce(ac.stripe_customer_id, c.stripe_customer_id),
    'expired', r.expires_at < now(), 'used', r.used_at is not null)
  from public.card_requests r
  left join public.contacts c on c.id = r.contact_id
  left join public.accounts ac on ac.id = r.account_id
  where r.token = p_token
$$;

-- The card to charge on the day of the clean: the default card for the
-- invoice's customer. Server-only (the charge is made with the secret key).
create function public.default_card_for_invoice(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('payment_method_id', m.stripe_payment_method_id,
    'customer_id', coalesce(ac.stripe_customer_id, c.stripe_customer_id), 'brand', m.brand, 'last4', m.last4)
  from public.invoices i
  left join public.contacts c on c.id = i.contact_id
  left join public.accounts ac on ac.id = i.account_id
  join public.payment_methods m on m.is_default
    and ((i.account_id is not null and m.account_id = i.account_id) or (i.contact_id is not null and m.contact_id = i.contact_id))
  where i.id = p_invoice_id
  order by m.account_id nulls last
  limit 1
$$;

revoke execute on function
  public.stripe_record_payment(uuid, bigint, text, text, text), public.stripe_record_refund(text, text, bigint),
  public.stripe_save_card(uuid, uuid, text, text, text, text, integer, integer, uuid),
  public.stripe_link_customer(uuid, uuid, text), public.mark_overdue_invoices(),
  public.invoice_for_pay_token(text), public.card_request_for_token(text), public.default_card_for_invoice(uuid)
  from public, anon, authenticated;
grant execute on function
  public.stripe_record_payment(uuid, bigint, text, text, text), public.stripe_record_refund(text, text, bigint),
  public.stripe_save_card(uuid, uuid, text, text, text, text, integer, integer, uuid),
  public.stripe_link_customer(uuid, uuid, text), public.mark_overdue_invoices(),
  public.invoice_for_pay_token(text), public.card_request_for_token(text), public.default_card_for_invoice(uuid)
  to service_role;
