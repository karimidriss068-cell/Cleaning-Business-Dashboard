-- The security advisor (lint 0029) flags SECURITY DEFINER functions that
-- signed-in users can call through the exposed API. my_jobs and complete_job
-- need definer rights, so their bodies move unchanged into the unexposed
-- private schema, and the public RPCs become thin SECURITY INVOKER wrappers.
-- Behavior and grants (authenticated only) are unchanged.

alter function public.my_jobs(date, date) set schema private;
alter function public.complete_job(uuid) set schema private;

-- ALTER ... SET SCHEMA keeps the ACL; restate it explicitly anyway.
revoke execute on function private.my_jobs(date, date), private.complete_job(uuid) from public, anon;
grant execute on function private.my_jobs(date, date), private.complete_job(uuid) to authenticated;

create function public.my_jobs(p_from date default null, p_to date default null)
returns table (
  job_id uuid,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status public.job_status,
  service_name text,
  client_name text,
  address_line1 text,
  address_line2 text,
  borough public.borough,
  zip text,
  access_instructions text,
  crew_notes text,
  photo_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.my_jobs(p_from, p_to)
$$;

create function public.complete_job(p_job_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.complete_job(p_job_id)
$$;

revoke execute on function public.my_jobs(date, date), public.complete_job(uuid) from public, anon;
grant execute on function public.my_jobs(date, date), public.complete_job(uuid) to authenticated;
