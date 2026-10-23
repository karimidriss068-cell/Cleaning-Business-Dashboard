-- Payout status rules.
--
-- Allowed status changes (anything else is refused):
--   draft    -> approved   normal flow
--   approved -> paid       normal flow
--   approved -> draft      reopen to fix a mistake
--   approved -> void       cancel (needs a reason)
--   paid     -> void       cancel (needs a reason)
-- Paid is final: apart from voiding, a paid payout can't change at all.
-- Void is terminal: a void payout can't change at all.
-- Only draft payouts can be deleted.
--
-- Voiding releases the payout's job assignments so they can be paid on a
-- corrected payout: "paid once" now applies to non-voided payout items only
-- (still a unique index, not app logic). The voided payout keeps its items
-- as a record.

alter table public.payouts
  add column void_reason text,
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (user_id) on delete set null,
  add constraint payouts_void_has_reason check (
    status <> 'void'
    or (void_reason is not null and length(btrim(void_reason)) > 0 and voided_at is not null)
  );

create index payouts_voided_by_idx on public.payouts (voided_by);

alter table public.payout_items add column voided boolean not null default false;
alter table public.payout_items drop constraint payout_items_job_assignment_id_key;
create unique index payout_items_active_assignment_key
  on public.payout_items (job_assignment_id) where not voided;
-- Keeps the FK on job_assignment_id indexed for voided rows too.
create index payout_items_job_assignment_id_idx on public.payout_items (job_assignment_id);

create function private.guard_payout_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'only draft payouts can be deleted (payout % is %)', old.id, old.status using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'void' then
    raise exception 'payout % is void and can''t be changed', old.id using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status
     and (old.status, new.status) not in (
       ('draft', 'approved'), ('approved', 'paid'), ('approved', 'draft'),
       ('approved', 'void'), ('paid', 'void')
     ) then
    raise exception 'payout status can''t change from % to %', old.status, new.status using errcode = 'P0001';
  end if;

  if old.status <> 'draft' and new.subcontractor_id is distinct from old.subcontractor_id then
    raise exception 'can''t change the subcontractor on a % payout', old.status using errcode = 'P0001';
  end if;

  if old.status = 'paid' then
    if new.status <> 'void' then
      raise exception 'payout % is paid and final; it can only be voided', old.id using errcode = 'P0001';
    end if;
    if (new.period_start, new.period_end, new.total_cents, new.payout_vendor_ref,
        new.approved_at, new.approved_by, new.paid_at, new.notes)
       is distinct from
       (old.period_start, old.period_end, old.total_cents, old.payout_vendor_ref,
        old.approved_at, old.approved_by, old.paid_at, old.notes) then
      raise exception 'voiding a paid payout can only set the void reason' using errcode = 'P0001';
    end if;
  end if;

  -- Stamp transitions.
  if new.status = 'approved' and old.status = 'draft' then
    new.approved_at := coalesce(new.approved_at, now());
    new.approved_by := coalesce(new.approved_by, (select auth.uid()));
  elsif new.status = 'draft' and old.status = 'approved' then
    new.approved_at := null;
    new.approved_by := null;
  elsif new.status = 'paid' and old.status = 'approved' then
    new.paid_at := coalesce(new.paid_at, now());
  elsif new.status = 'void' then
    new.voided_at := now();
    new.voided_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger payouts_guard_status
  before update or delete on public.payouts
  for each row execute function private.guard_payout_status();

-- Voiding a payout marks its items voided, releasing their assignments.
create function private.void_payout_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.payout_items set voided = true where payout_id = new.id and not voided;
  return null;
end;
$$;

create trigger payouts_void_items
  after update of status on public.payouts
  for each row
  when (new.status = 'void' and old.status is distinct from 'void')
  execute function private.void_payout_items();

-- Item guard, updated: the only change allowed on a non-draft payout's items
-- is the voided flag flipping on when the payout itself is voided.
create or replace function private.guard_payout_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.payout_status;
  v_payout_sub uuid;
  v_assignment_sub uuid;
begin
  if tg_op = 'UPDATE' and new.voided and not old.voided
     and (new.payout_id, new.job_assignment_id, new.amount_cents)
         = (old.payout_id, old.job_assignment_id, old.amount_cents) then
    select p.status into v_status from public.payouts p where p.id = new.payout_id;
    if v_status = 'void' then
      return new;
    end if;
  end if;

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
    if new.voided then
      raise exception 'items are voided only by voiding their payout' using errcode = 'P0001';
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

-- Total recompute, updated: write only when the total actually changes, so
-- flipping items to voided doesn't touch the (now immutable) void payout.
create or replace function private.recompute_payout_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected uuid;
  v_total bigint;
begin
  foreach affected in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.payout_id end,
    case when tg_op in ('UPDATE', 'DELETE') then old.payout_id end
  ], null)
  loop
    select coalesce(sum(pi.amount_cents), 0) into v_total
    from public.payout_items pi where pi.payout_id = affected;
    update public.payouts p set total_cents = v_total
    where p.id = affected and p.total_cents is distinct from v_total;
  end loop;
  return null;
end;
$$;

-- Trigger-only functions: no grants.
revoke execute on function private.guard_payout_status(), private.void_payout_items(),
  private.guard_payout_item(), private.recompute_payout_total() from public, anon, authenticated;
