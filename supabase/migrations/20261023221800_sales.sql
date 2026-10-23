-- Sales: quotes and their line items.
--
-- Money integrity lives in the database: line totals are generated columns,
-- quotes.subtotal_cents is recomputed by trigger whenever items change, and
-- quotes.total_cents is generated from subtotal - discount + tax.

create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint generated always as identity unique,
  lead_id uuid references public.leads (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete restrict,
  account_id uuid references public.accounts (id) on delete restrict,
  property_id uuid references public.properties (id) on delete restrict,
  status public.quote_status not null default 'draft',
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint generated always as (subtotal_cents - discount_cents + tax_cents) stored,
  valid_until date,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  notes text,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_has_customer check (num_nonnulls(contact_id, account_id) >= 1),
  constraint quotes_discount_le_subtotal check (discount_cents <= subtotal_cents)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  description text not null check (length(btrim(description)) > 0),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint generated always as (quantity * unit_price_cents) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_lead_id_idx on public.quotes (lead_id);
create index quotes_contact_id_idx on public.quotes (contact_id);
create index quotes_account_id_idx on public.quotes (account_id);
create index quotes_property_id_idx on public.quotes (property_id);
create index quotes_created_by_idx on public.quotes (created_by);
create index quotes_status_idx on public.quotes (status);
create index quote_items_quote_id_idx on public.quote_items (quote_id, sort_order);
create index quote_items_service_id_idx on public.quote_items (service_id);

create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function private.set_updated_at();
create trigger quote_items_set_updated_at before update on public.quote_items
  for each row execute function private.set_updated_at();

-- Runs as the caller (no security definer): staff already have UPDATE on
-- quotes through RLS.
create function private.recompute_quote_subtotal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.quote_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.quote_id end
  ], null)
  loop
    update public.quotes q
    set subtotal_cents = coalesce(
      (select sum(i.line_total_cents) from public.quote_items i where i.quote_id = affected), 0)
    where q.id = affected;
  end loop;
  return null;
end;
$$;

create trigger quote_items_recompute_subtotal
  after insert or update or delete on public.quote_items
  for each row execute function private.recompute_quote_subtotal();

-- Trigger-only: nobody needs to call it directly.
revoke execute on function private.recompute_quote_subtotal() from public, anon;

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
revoke all on public.quotes, public.quote_items from anon;

create policy "quotes: staff read" on public.quotes for select to authenticated using ((select private.is_staff()));
create policy "quotes: staff insert" on public.quotes for insert to authenticated with check ((select private.is_staff()));
create policy "quotes: staff update" on public.quotes for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "quotes: admin delete" on public.quotes for delete to authenticated using ((select private.is_admin()));

create policy "quote_items: staff read" on public.quote_items for select to authenticated using ((select private.is_staff()));
create policy "quote_items: staff insert" on public.quote_items for insert to authenticated with check ((select private.is_staff()));
create policy "quote_items: staff update" on public.quote_items for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "quote_items: staff delete" on public.quote_items for delete to authenticated using ((select private.is_staff()));
