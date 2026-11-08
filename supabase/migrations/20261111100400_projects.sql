-- Projects: a won bid becomes a one-time project with work days (ordinary jobs, so the schedule, crew view
-- and pay snapshots keep working), milestone invoices (deposit, progress, final) on the existing invoice
-- system, and project costs tagged on expenses. Owner and admin only: projects carry contract value and cost.
-- Work days are priced at $0 and billed through the project's invoices, so nothing is counted twice; what a
-- cleaner earns for a day is set on the assignment (pay_override_cents). Cleaners on a project are paid
-- once the project's FINAL invoice is paid or marked collected (payout_core).

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number bigint generated always as identity unique,
  bid_id uuid not null unique references public.bids (id) on delete restrict,
  lead_id uuid not null references public.leads (id) on delete restrict,
  account_id uuid not null references public.accounts (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete restrict,
  property_id uuid not null references public.properties (id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  -- The bid's price when it was won, and what the bid expected to cost, kept so profit can be compared.
  contract_cents bigint not null check (contract_cents > 0),
  bid_version integer not null,
  estimated_cost_cents bigint not null check (estimated_cost_cents >= 0),
  estimated_margin_bps integer not null,
  -- Share of the contract invoiced as the deposit (3000 = 30%); the rest is billed on completion.
  deposit_bps integer not null default 3000 check (deposit_bps between 0 and 10000),
  starts_on date,
  ends_on date,
  notes text check (notes is null or length(notes) <= 2000),
  completed_at timestamptz,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index projects_lead_id_idx on public.projects (lead_id);
create index projects_account_id_idx on public.projects (account_id);
create index projects_contact_id_idx on public.projects (contact_id);
create index projects_property_id_idx on public.projects (property_id);
create index projects_created_by_idx on public.projects (created_by);
create trigger projects_set_updated_at before update on public.projects for each row execute function private.set_updated_at();

alter table public.projects enable row level security;
create policy "projects: admin read" on public.projects for select to authenticated using ((select private.is_admin()));
revoke all on public.projects from anon, authenticated;
grant select on public.projects to authenticated;

alter table public.jobs add column project_id uuid references public.projects (id) on delete set null;
create index jobs_project_id_idx on public.jobs (project_id) where project_id is not null;

alter table public.invoices
  add column project_id uuid references public.projects (id) on delete set null,
  add column milestone text check (milestone is null or milestone in ('deposit', 'progress', 'final')),
  add constraint invoices_milestone_with_project check ((milestone is null) = (project_id is null));
create index invoices_project_id_idx on public.invoices (project_id) where project_id is not null;
-- One live deposit and one live final invoice per project (progress payments can repeat); void frees the slot.
create unique index invoices_project_milestone_key on public.invoices (project_id, milestone) where milestone in ('deposit', 'final') and status <> 'void';

alter table public.expenses add column project_id uuid references public.projects (id) on delete set null;
create index expenses_project_id_idx on public.expenses (project_id) where project_id is not null;

alter table public.finance_log drop constraint finance_log_entity_check;
alter table public.finance_log add constraint finance_log_entity_check
  check (entity in ('invoice', 'payment', 'refund', 'card', 'payout', 'document', 'settings', 'growth', 'ghl', 'ai', 'board', 'pricing', 'bid', 'project'));

insert into public.services (name, description, pricing_model, base_price_cents, default_duration_minutes)
values ('Commercial project', 'A work day on a commercial cleaning project; billed through the project''s invoices.', 'flat', 0, 480)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

create function private.create_project_from_bid(
  p_bid_id uuid, p_expected_updated_at timestamptz,
  p_title text default null, p_deposit_bps integer default 3000, p_starts_on date default null, p_ends_on date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bid public.bids%rowtype;
  v_ver public.bid_versions%rowtype;
  v_lead public.leads%rowtype;
  v_contact public.contacts%rowtype;
  v_property uuid;
  v_project public.projects%rowtype;
  v_title text;
begin
  perform private.require_admin();
  select * into v_bid from public.bids where id = p_bid_id for update;
  if not found then
    raise exception 'bid not found' using errcode = 'KC005';
  end if;
  if v_bid.updated_at is distinct from p_expected_updated_at then
    raise exception 'this bid was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if exists (select 1 from public.projects where bid_id = p_bid_id) then
    raise exception 'this bid already has a project' using errcode = 'KC010';
  end if;
  if v_bid.status <> 'sent' then
    raise exception 'only a bid that was sent can be won (this one is %)', v_bid.status using errcode = 'KC004';
  end if;
  if p_deposit_bps is null or p_deposit_bps not between 0 and 10000 then
    raise exception 'the deposit is a share between 0 and 100 percent' using errcode = 'KC005';
  end if;
  v_title := coalesce(nullif(btrim(coalesce(p_title, '')), ''), v_bid.title);
  if length(v_title) > 160 then
    raise exception 'keep the title under 160 characters' using errcode = 'KC005';
  end if;
  select * into v_ver from public.bid_versions where bid_id = v_bid.id and version = v_bid.current_version;
  select * into v_lead from public.leads where id = v_bid.lead_id for update;
  select * into v_contact from public.contacts where id = v_bid.contact_id;

  -- The site: the company's existing property, else one made from the contact's address.
  select id into v_property from public.properties where account_id = v_bid.account_id and is_active order by created_at limit 1;
  if v_property is null then
    if v_contact.address_line1 is null or v_contact.zip is null or v_contact.borough is null then
      raise exception 'add the site address (street, ZIP and borough) to the contact first' using errcode = 'KC005';
    end if;
    insert into public.properties (account_id, label, address_line1, address_line2, zip, borough)
    values (v_bid.account_id, 'Project site', v_contact.address_line1, v_contact.address_line2, v_contact.zip, v_contact.borough)
    returning id into v_property;
  end if;

  insert into public.projects (bid_id, lead_id, account_id, contact_id, property_id, title, contract_cents, bid_version,
                               estimated_cost_cents, estimated_margin_bps, deposit_bps, starts_on, ends_on, created_by)
  values (v_bid.id, v_bid.lead_id, v_bid.account_id, v_bid.contact_id, v_property, v_title, v_ver.price_cents, v_ver.version,
          v_ver.cost_cents, v_ver.margin_bps, p_deposit_bps, p_starts_on, p_ends_on, (select auth.uid()))
  returning * into v_project;
  update public.bids set status = 'won' where id = v_bid.id;
  update public.accounts set status = 'active' where id = v_bid.account_id and status = 'prospect';
  if v_lead.stage <> 'won' then
    perform public.move_lead_stage(v_lead.id, v_lead.updated_at, 'won');
  end if;
  perform private.log_finance('project', v_project.id, 'created', jsonb_build_object('bid_id', v_bid.id, 'contract_cents', v_ver.price_cents, 'deposit_bps', p_deposit_bps));
  return jsonb_build_object('project_id', v_project.id, 'project_number', v_project.project_number);
end;
$$;

create function private.set_project_status(p_project_id uuid, p_status text, p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.projects%rowtype;
  v_updated timestamptz;
begin
  perform private.require_admin();
  select * into v_p from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project not found' using errcode = 'KC005';
  end if;
  if v_p.updated_at is distinct from p_expected_updated_at then
    raise exception 'this project was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if not ((v_p.status = 'scheduled' and p_status in ('in_progress', 'cancelled'))
       or (v_p.status = 'in_progress' and p_status in ('completed', 'cancelled'))
       or (v_p.status = 'completed' and p_status = 'in_progress')) then
    raise exception 'a % project can''t be set to %', v_p.status, p_status using errcode = 'KC004';
  end if;
  update public.projects
  set status = p_status, completed_at = case when p_status = 'completed' then now() else null end
  where id = p_project_id
  returning updated_at into v_updated;
  perform private.log_finance('project', p_project_id, 'status_' || p_status, jsonb_build_object('from', v_p.status));
  return v_updated;
end;
$$;

create function private.create_project_invoice(p_project_id uuid, p_milestone text, p_amount_cents bigint default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.projects%rowtype;
  v_set public.business_settings%rowtype;
  v_billed bigint;
  v_amount bigint;
  v_inv uuid;
  v_label text;
begin
  perform private.require_admin();
  select * into v_p from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project not found' using errcode = 'KC005';
  end if;
  if v_p.status = 'cancelled' then
    raise exception 'this project was cancelled' using errcode = 'KC004';
  end if;
  if p_milestone not in ('deposit', 'progress', 'final') then
    raise exception 'choose deposit, progress or final' using errcode = 'KC005';
  end if;
  if p_milestone in ('deposit', 'final') and exists (
       select 1 from public.invoices i where i.project_id = p_project_id and i.milestone = p_milestone and i.status <> 'void') then
    raise exception 'this project already has a % invoice', p_milestone using errcode = 'KC010';
  end if;
  select coalesce(sum(i.subtotal_cents - i.discount_cents), 0) into v_billed
  from public.invoices i where i.project_id = p_project_id and i.status <> 'void';
  v_amount := case p_milestone
    when 'deposit' then coalesce(p_amount_cents, (v_p.contract_cents * v_p.deposit_bps + 5000) / 10000)
    when 'final' then coalesce(p_amount_cents, v_p.contract_cents - v_billed)
    else p_amount_cents end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'enter an amount above zero' using errcode = 'KC005';
  end if;
  if v_billed + v_amount > v_p.contract_cents then
    raise exception 'that would invoice more than the contract (% already invoiced of %)', v_billed, v_p.contract_cents using errcode = 'KC004';
  end if;
  select * into v_set from public.business_settings;
  v_label := case p_milestone
    when 'deposit' then format('Deposit (%s%%): %s', round(v_p.deposit_bps / 100.0, 1), v_p.title)
    when 'final' then 'Final payment: ' || v_p.title
    else 'Progress payment: ' || v_p.title end;
  insert into public.invoices (contact_id, account_id, tax_rate_ppm, created_by, project_id, milestone)
  values (v_p.contact_id, v_p.account_id, v_set.tax_rate_ppm, (select auth.uid()), v_p.id, p_milestone)
  returning id into v_inv;
  insert into public.invoice_line_items (invoice_id, description, quantity, unit_price_cents, taxable, sort_order)
  values (v_inv, left(v_label, 300), 1, v_amount, v_set.default_line_taxable, 0);
  perform private.log_finance('invoice', v_inv, 'created', jsonb_build_object('from', 'project', 'project_id', v_p.id, 'milestone', p_milestone, 'amount_cents', v_amount));
  perform private.log_finance('project', v_p.id, 'invoice_created', jsonb_build_object('invoice_id', v_inv, 'milestone', p_milestone, 'amount_cents', v_amount));
  return v_inv;
end;
$$;

create function private.schedule_project_day(p_project_id uuid, p_start timestamptz, p_end timestamptz, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.projects%rowtype;
  v_service uuid;
  v_job uuid;
begin
  perform private.require_admin();
  select * into v_p from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project not found' using errcode = 'KC005';
  end if;
  if v_p.status in ('completed', 'cancelled') then
    raise exception 'a % project can''t take new work days', v_p.status using errcode = 'KC004';
  end if;
  if p_start is null or p_end is null or p_end <= p_start or p_end - p_start > interval '24 hours' then
    raise exception 'a work day must end after it starts and be under 24 hours' using errcode = 'KC005';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception 'keep the notes under 2,000 characters' using errcode = 'KC005';
  end if;
  select id into v_service from public.services where name = 'Commercial project';
  insert into public.jobs (contact_id, account_id, property_id, service_id, scheduled_start, scheduled_end, price_cents, project_id, notes)
  values (v_p.contact_id, v_p.account_id, v_p.property_id, v_service, p_start, p_end, 0, v_p.id, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_job;
  perform private.log_finance('project', v_p.id, 'day_scheduled', jsonb_build_object('job_id', v_job, 'start', p_start, 'end', p_end));
  return v_job;
end;
$$;

-- Assign cleaners to a work day. The blocking rules (double booking, expired insurance, inactive cleaners)
-- are reassign_job's; pay is what each cleaner earns for the day, set here because the day itself has no price.
create function private.assign_project_day(
  p_job_id uuid, p_expected_updated_at timestamptz, p_subcontractor_ids uuid[],
  p_pay_cents bigint default null, p_override_reason text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_result timestamptz;
begin
  perform private.require_admin();
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.project_id is null then
    raise exception 'that isn''t a project work day' using errcode = 'KC005';
  end if;
  if p_pay_cents is not null and (p_pay_cents < 0 or p_pay_cents > 100000000) then
    raise exception 'enter the day''s pay in dollars' using errcode = 'KC005';
  end if;
  v_result := public.reassign_job(p_job_id, p_expected_updated_at, v_job.crew_id, p_subcontractor_ids, v_job.scheduled_start, v_job.scheduled_end, p_override_reason);
  if p_pay_cents is not null then
    update public.job_assignments set pay_override_cents = p_pay_cents where job_id = p_job_id and subcontractor_id = any (p_subcontractor_ids);
  end if;
  perform private.log_finance('project', v_job.project_id, 'day_assigned', jsonb_build_object('job_id', p_job_id, 'cleaners', coalesce(array_length(p_subcontractor_ids, 1), 0), 'pay_cents', p_pay_cents));
  return v_result;
end;
$$;

create function private.set_assignment_pay(p_assignment_id uuid, p_pay_cents bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  perform private.require_admin();
  if p_pay_cents is null or p_pay_cents < 0 or p_pay_cents > 100000000 then
    raise exception 'enter the day''s pay in dollars' using errcode = 'KC005';
  end if;
  select j.project_id into v_project from public.job_assignments a join public.jobs j on j.id = a.job_id where a.id = p_assignment_id;
  if v_project is null then
    raise exception 'that assignment isn''t on a project work day' using errcode = 'KC005';
  end if;
  update public.job_assignments set pay_override_cents = p_pay_cents where id = p_assignment_id;
  perform private.log_finance('project', v_project, 'pay_set', jsonb_build_object('assignment_id', p_assignment_id, 'pay_cents', p_pay_cents));
end;
$$;

create function private.record_project_cost(p_project_id uuid, p_category public.expense_category, p_amount_cents bigint, p_date date, p_description text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_id uuid;
begin
  perform private.require_admin();
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'project not found' using errcode = 'KC005';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'enter an amount above zero, up to $1,000,000' using errcode = 'KC005';
  end if;
  if p_date is null or p_date > v_today or p_date < v_today - 800 then
    raise exception 'the date must be in the past two years and not in the future' using errcode = 'KC005';
  end if;
  if p_description is not null and length(p_description) > 200 then
    raise exception 'keep the description under 200 characters' using errcode = 'KC005';
  end if;
  insert into public.expenses (category, description, amount_cents, incurred_on, project_id, created_by)
  values (p_category, coalesce(nullif(btrim(p_description), ''), initcap(p_category::text)), p_amount_cents, p_date, p_project_id, (select auth.uid()))
  returning id into v_id;
  perform private.log_finance('project', p_project_id, 'cost_recorded', jsonb_build_object('expense_id', v_id, 'category', p_category, 'amount_cents', p_amount_cents));
  return v_id;
end;
$$;

create function private.delete_project_cost(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  perform private.require_admin();
  select project_id into v_project from public.expenses where id = p_id;
  if v_project is null then
    raise exception 'that cost isn''t on a project' using errcode = 'KC005';
  end if;
  delete from public.expenses where id = p_id and project_id is not null;
  perform private.log_finance('project', v_project, 'cost_deleted', jsonb_build_object('expense_id', p_id));
end;
$$;

-- Public invoker wrappers ---------------------------------------------------------------------

create function public.create_project_from_bid(p_bid_id uuid, p_expected_updated_at timestamptz, p_title text default null, p_deposit_bps integer default 3000, p_starts_on date default null, p_ends_on date default null)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.create_project_from_bid(p_bid_id, p_expected_updated_at, p_title, p_deposit_bps, p_starts_on, p_ends_on) $$;
create function public.set_project_status(p_project_id uuid, p_status text, p_expected_updated_at timestamptz)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.set_project_status(p_project_id, p_status, p_expected_updated_at) $$;
create function public.create_project_invoice(p_project_id uuid, p_milestone text, p_amount_cents bigint default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.create_project_invoice(p_project_id, p_milestone, p_amount_cents) $$;
create function public.schedule_project_day(p_project_id uuid, p_start timestamptz, p_end timestamptz, p_notes text default null)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.schedule_project_day(p_project_id, p_start, p_end, p_notes) $$;
create function public.assign_project_day(p_job_id uuid, p_expected_updated_at timestamptz, p_subcontractor_ids uuid[], p_pay_cents bigint default null, p_override_reason text default null)
returns timestamptz language sql volatile security invoker set search_path = ''
as $$ select private.assign_project_day(p_job_id, p_expected_updated_at, p_subcontractor_ids, p_pay_cents, p_override_reason) $$;
create function public.set_assignment_pay(p_assignment_id uuid, p_pay_cents bigint)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.set_assignment_pay(p_assignment_id, p_pay_cents) $$;
create function public.record_project_cost(p_project_id uuid, p_category public.expense_category, p_amount_cents bigint, p_date date, p_description text)
returns uuid language sql volatile security invoker set search_path = ''
as $$ select private.record_project_cost(p_project_id, p_category, p_amount_cents, p_date, p_description) $$;
create function public.delete_project_cost(p_id uuid)
returns void language sql volatile security invoker set search_path = ''
as $$ select private.delete_project_cost(p_id) $$;

revoke execute on function
  private.create_project_from_bid(uuid, timestamptz, text, integer, date, date), private.set_project_status(uuid, text, timestamptz),
  private.create_project_invoice(uuid, text, bigint), private.schedule_project_day(uuid, timestamptz, timestamptz, text),
  private.assign_project_day(uuid, timestamptz, uuid[], bigint, text), private.set_assignment_pay(uuid, bigint),
  private.record_project_cost(uuid, public.expense_category, bigint, date, text), private.delete_project_cost(uuid),
  public.create_project_from_bid(uuid, timestamptz, text, integer, date, date), public.set_project_status(uuid, text, timestamptz),
  public.create_project_invoice(uuid, text, bigint), public.schedule_project_day(uuid, timestamptz, timestamptz, text),
  public.assign_project_day(uuid, timestamptz, uuid[], bigint, text), public.set_assignment_pay(uuid, bigint),
  public.record_project_cost(uuid, public.expense_category, bigint, date, text), public.delete_project_cost(uuid)
  from public, anon;
grant execute on function
  private.create_project_from_bid(uuid, timestamptz, text, integer, date, date), private.set_project_status(uuid, text, timestamptz),
  private.create_project_invoice(uuid, text, bigint), private.schedule_project_day(uuid, timestamptz, timestamptz, text),
  private.assign_project_day(uuid, timestamptz, uuid[], bigint, text), private.set_assignment_pay(uuid, bigint),
  private.record_project_cost(uuid, public.expense_category, bigint, date, text), private.delete_project_cost(uuid),
  public.create_project_from_bid(uuid, timestamptz, text, integer, date, date), public.set_project_status(uuid, text, timestamptz),
  public.create_project_invoice(uuid, text, bigint), public.schedule_project_day(uuid, timestamptz, timestamptz, text),
  public.assign_project_day(uuid, timestamptz, uuid[], bigint, text), public.set_assignment_pay(uuid, bigint),
  public.record_project_cost(uuid, public.expense_category, bigint, date, text), public.delete_project_cost(uuid)
  to authenticated;

-- Existing functions that must know about projects (asserted edits) -----------------------------------
do $patch$
declare
  edits jsonb := $e$[
    {"fn": "payout_core", "schema": "private", "old": "    select i.id, i.invoice_number, i.status, i.total_cents, i.amount_paid_cents, i.collected_at\n    from public.invoice_line_items li join public.invoices i on i.id = li.invoice_id\n    where li.job_id = j.id and not li.voided\n    limit 1\n  ) inv on true", "new": "    select x.id, x.invoice_number, x.status, x.total_cents, x.amount_paid_cents, x.collected_at from (\n      select 1 as prio, i.id, i.invoice_number, i.status, i.total_cents, i.amount_paid_cents, i.collected_at\n      from public.invoice_line_items li join public.invoices i on i.id = li.invoice_id\n      where li.job_id = j.id and not li.voided\n      union all\n      select 2, i.id, i.invoice_number, i.status, i.total_cents, i.amount_paid_cents, i.collected_at\n      from public.invoices i\n      where j.project_id is not null and i.project_id = j.project_id and i.milestone = 'final' and i.status <> 'void'\n    ) x order by x.prio limit 1\n  ) inv on true"},
    {"fn": "create_invoice_from_job", "schema": "private", "old": "raise exception 'only completed visits can be invoiced' using errcode = 'KC004';\n  end if;", "new": "raise exception 'only completed visits can be invoiced' using errcode = 'KC004';\n  end if;\n  if j.project_id is not null then\n    raise exception 'project work days are billed through the project''s invoices' using errcode = 'KC004';\n  end if;"}
  ]$e$::jsonb;
  e jsonb;
  v_oid oid;
  v_def text;
begin
  for e in select * from jsonb_array_elements(edits) loop
    select p.oid into strict v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = e->>'schema' and p.proname = e->>'fn';
    v_def := pg_get_functiondef(v_oid);
    if position(e->>'old' in v_def) = 0 then
      raise exception 'projects migration: % no longer contains the expected text', e->>'fn';
    end if;
    execute replace(v_def, e->>'old', e->>'new');
  end loop;
end
$patch$;
