-- Goals: targets per metric and period, shown against actuals on the dashboard.
--
-- Access: staff read, admin write.

create type public.goal_metric as enum (
  'revenue_cents',
  'jobs_completed',
  'leads',
  'new_clients',
  'close_rate_bps',
  'avg_first_response_minutes'
);
create type public.goal_period as enum ('week', 'month', 'quarter', 'year');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  metric public.goal_metric not null,
  period public.goal_period not null,
  -- America/New_York calendar dates.
  period_start date not null,
  period_end date not null,
  -- Unit follows the metric name: cents, a count, basis points, or minutes.
  target_value bigint not null check (target_value >= 0),
  notes text,
  created_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_period_order check (period_end >= period_start),
  constraint goals_metric_period_start_key unique (metric, period, period_start)
);

create index goals_created_by_idx on public.goals (created_by);

create trigger goals_set_updated_at before update on public.goals
  for each row execute function private.set_updated_at();

alter table public.goals enable row level security;
revoke all on public.goals from anon;

create policy "goals: staff read" on public.goals for select to authenticated using ((select private.is_staff()));
create policy "goals: admin insert" on public.goals for insert to authenticated with check ((select private.is_admin()));
create policy "goals: admin update" on public.goals for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "goals: admin delete" on public.goals for delete to authenticated using ((select private.is_admin()));
