-- Powers the "Demo data loaded, purge before launch" banner. Returns only a
-- boolean: whether any seed rows (ids prefixed 5eed0000-, see scripts/seed.mts)
-- exist. Crew members can't read the seeded tables, so the check runs with
-- definer rights in the unexposed private schema behind an invoker wrapper,
-- same pattern as my_jobs (migration 6b). Callable by signed-in members only.

create function private.demo_data_present()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_member() and (
    exists (select 1 from public.services where id::text like '5eed0000-%')
    or exists (select 1 from public.contacts where id::text like '5eed0000-%')
    or exists (select 1 from public.jobs where id::text like '5eed0000-%')
  )
$$;

create function public.demo_data_present()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.demo_data_present()
$$;

revoke execute on function private.demo_data_present(), public.demo_data_present() from public, anon;
grant execute on function private.demo_data_present(), public.demo_data_present() to authenticated;
