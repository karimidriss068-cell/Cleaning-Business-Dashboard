-- Foundation: membership (profiles + roles), RLS helper functions, the
-- updated_at trigger function, and shared enums. Every later migration
-- builds on these.
--
-- Membership model: one business, no tenancy. A logged-in user is a member
-- only if they have an active row in public.profiles. Every policy goes
-- through the helpers below, so a user without a profile gets nothing.

-- Helpers live in a schema PostgREST doesn't expose, so they can't be called
-- as RPCs. Policies still call them as the querying role, which needs USAGE.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- anon never needs table access in this app. Defense in depth only: every
-- table migration also revokes anon explicitly.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Function safety does NOT rely on default privileges: a schema-scoped
-- "alter default privileges ... revoke execute" can't remove the global
-- PUBLIC execute default. Every function in every migration instead gets an
-- explicit "revoke execute ... from public, anon" plus a grant to the one
-- role that needs it.

create type public.app_role as enum ('owner', 'admin', 'staff', 'subcontractor');
create type public.borough as enum ('manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island');

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text check (phone ~ '^\+1[2-9][0-9]{9}$'),
  -- FK to subcontractors is added in the workforce migration.
  subcontractor_id uuid unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_subcontractor_link
    check ((role = 'subcontractor') = (subcontractor_id is not null))
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- security definer so these can read profiles without recursing through
-- profiles' own RLS policies.
create function private.member_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.is_active
$$;

create function private.current_subcontractor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.subcontractor_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.is_active and p.role = 'subcontractor'
$$;

create function private.has_role(roles public.app_role[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(private.member_role() = any (roles), false)
$$;

create function private.is_member()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.member_role() is not null
$$;

-- owner, admin, staff: the office team.
create function private.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_role(array['owner', 'admin', 'staff']::public.app_role[])
$$;

create function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_role(array['owner', 'admin']::public.app_role[])
$$;

-- The business can never be left without an active owner: block deleting,
-- demoting or deactivating the last one. This also blocks deleting that
-- owner's auth user, since profiles cascades from auth.users.
-- security definer so it sees every owner regardless of the caller's RLS.
create function private.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'owner' or not new.is_active) then
    -- Lock all active owner rows so two owners demoting each other at the
    -- same time can't both succeed and leave zero.
    perform 1 from public.profiles p where p.role = 'owner' and p.is_active for update;
    if not exists (
      select 1 from public.profiles p
      where p.role = 'owner' and p.is_active and p.user_id <> old.user_id
    ) then
      raise exception 'cannot remove the last active owner' using errcode = 'P0001';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_guard_last_owner
  before update or delete on public.profiles
  for each row execute function private.guard_last_owner();

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.member_role(),
  private.current_subcontractor_id(),
  private.has_role(public.app_role[]),
  private.is_member(),
  private.is_staff(),
  private.is_admin()
to authenticated, service_role;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

create policy "profiles: read own or staff reads all"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));

-- Owners manage everyone. Admins manage staff and subcontractors only, so an
-- admin can't promote themselves or change an owner.
create policy "profiles: insert"
  on public.profiles for insert to authenticated
  with check (
    (select private.has_role(array['owner']::public.app_role[]))
    or ((select private.has_role(array['admin']::public.app_role[])) and role in ('staff', 'subcontractor'))
  );

create policy "profiles: update"
  on public.profiles for update to authenticated
  using (
    (select private.has_role(array['owner']::public.app_role[]))
    or ((select private.has_role(array['admin']::public.app_role[])) and role in ('staff', 'subcontractor'))
  )
  with check (
    (select private.has_role(array['owner']::public.app_role[]))
    or ((select private.has_role(array['admin']::public.app_role[])) and role in ('staff', 'subcontractor'))
  );

create policy "profiles: delete"
  on public.profiles for delete to authenticated
  using (
    (select private.has_role(array['owner']::public.app_role[]))
    or ((select private.has_role(array['admin']::public.app_role[])) and role in ('staff', 'subcontractor'))
  );
