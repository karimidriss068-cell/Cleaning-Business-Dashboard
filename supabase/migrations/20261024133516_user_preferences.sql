-- Per-user appearance preferences (visual direction and light/dark theme).
--
-- Own-row access for every member, crew included: profiles only lets admins
-- update rows, so preferences live in their own table. A signed-in member
-- can read, create and update only their own row; there's no delete (the row
-- goes with the user). Members only, like every other table: a login without
-- a profile gets nothing.

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  direction text not null default 'titanium' check (direction in ('titanium', 'ocean', 'midnight')),
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at before update on public.user_preferences
  for each row execute function private.set_updated_at();

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon;
revoke delete on public.user_preferences from authenticated;

create policy "user_preferences: read own" on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member()));
create policy "user_preferences: insert own" on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_member()));
create policy "user_preferences: update own" on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_member()))
  with check (user_id = (select auth.uid()) and (select private.is_member()));
