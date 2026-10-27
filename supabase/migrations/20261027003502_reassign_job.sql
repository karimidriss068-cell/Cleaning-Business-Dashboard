-- Dispatch: move a visit to another crew / people / time in one transaction.
--
-- public.reassign_job runs as the caller (SECURITY INVOKER), so staff RLS
-- applies; crew logins are refused up front. Behavior:
--   * locks the visit; refuses if it changed since the caller loaded it
--     (p_expected_updated_at), so two dispatchers can't overwrite each other
--   * only scheduled visits can move; visits with a payout on them are settled
--   * blocks double-booking, expired insurance and inactive subcontractors;
--     an admin can override by giving a reason, which is logged in activities
--   * replaces only the assignments that change (staying cleaners keep their
--     row and pay); new ones snapshot current pay terms via the existing trigger
--   * logs an activity entry for every move
-- Errors (SQLSTATE): KC001 stale, KC002 blocked, KC003 settled, KC004 not
-- movable, KC005 bad input.

-- Payouts aren't readable by staff, so the settled checks run as definer in
-- the unexposed private schema.
create function private.job_on_settled_payout(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_assignments a
    join public.payout_items pi on pi.job_assignment_id = a.id and not pi.voided
    join public.payouts p on p.id = pi.payout_id
    where a.job_id = p_job_id and p.status in ('approved', 'paid')
  )
$$;

create function private.assignments_on_payout(p_job_id uuid, p_subcontractor_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_assignments a
    join public.payout_items pi on pi.job_assignment_id = a.id and not pi.voided
    where a.job_id = p_job_id and a.subcontractor_id = any (p_subcontractor_ids)
  )
$$;

revoke execute on function private.job_on_settled_payout(uuid), private.assignments_on_payout(uuid, uuid[]) from public, anon;
grant execute on function private.job_on_settled_payout(uuid), private.assignments_on_payout(uuid, uuid[]) to authenticated;

create function public.reassign_job(
  p_job_id uuid,
  p_expected_updated_at timestamptz,
  p_crew_id uuid,
  p_subcontractor_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_override_reason text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_new uuid[] := coalesce(array(select distinct unnest(p_subcontractor_ids)), '{}');
  v_old uuid[];
  v_removed uuid[];
  v_added uuid[];
  v_conflicts text[] := '{}';
  v_sub record;
  v_local_date date := (p_start at time zone 'America/New_York')::date;
  v_from_crew text;
  v_to_crew text;
  v_result timestamptz;
  v_override boolean := false;
begin
  if not private.is_staff() then
    raise exception 'only office staff can reassign visits' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'visit must end after it starts' using errcode = 'KC005';
  end if;
  if p_override_reason is not null and length(btrim(p_override_reason)) = 0 then
    raise exception 'override reason must not be blank' using errcode = 'KC005';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'visit not found' using errcode = 'KC005';
  end if;
  if v_job.updated_at is distinct from p_expected_updated_at then
    raise exception 'this visit was changed by someone else; reload and try again' using errcode = 'KC001';
  end if;
  if v_job.status <> 'scheduled' then
    raise exception 'only scheduled visits can be moved (this one is %)', v_job.status using errcode = 'KC004';
  end if;
  if private.job_on_settled_payout(p_job_id) then
    raise exception 'this visit is on an approved or paid payout' using errcode = 'KC003';
  end if;

  select coalesce(array_agg(subcontractor_id), '{}') into v_old from public.job_assignments where job_id = p_job_id;
  v_removed := array(select unnest(v_old) except select unnest(v_new));
  v_added := array(select unnest(v_new) except select unnest(v_old));
  if private.assignments_on_payout(p_job_id, v_removed) then
    raise exception 'a removed cleaner already has this visit on a payout' using errcode = 'KC003';
  end if;

  if p_crew_id is not null and not exists (select 1 from public.crews where id = p_crew_id) then
    raise exception 'unknown crew' using errcode = 'KC005';
  end if;

  for v_sub in
    select s.id, s.display_name, s.status, s.coi_expires_on from public.subcontractors s where s.id = any (v_new)
  loop
    if v_sub.status <> 'active' then
      v_conflicts := v_conflicts || format('inactive: %s', v_sub.display_name);
    end if;
    if v_sub.coi_expires_on is not null and v_sub.coi_expires_on < v_local_date then
      v_conflicts := v_conflicts || format('insurance_expired: %s', v_sub.display_name);
    end if;
    if exists (
      select 1
      from public.job_assignments a
      join public.jobs j on j.id = a.job_id
      where a.subcontractor_id = v_sub.id
        and j.id <> p_job_id
        and j.status in ('scheduled', 'in_progress')
        and tstzrange(j.scheduled_start, j.scheduled_end) && tstzrange(p_start, p_end)
    ) then
      v_conflicts := v_conflicts || format('double_booked: %s', v_sub.display_name);
    end if;
  end loop;
  if (select count(*) from public.subcontractors where id = any (v_new)) <> coalesce(array_length(v_new, 1), 0) then
    raise exception 'unknown subcontractor' using errcode = 'KC005';
  end if;

  if array_length(v_conflicts, 1) > 0 then
    if p_override_reason is null then
      raise exception 'blocked: %', array_to_string(v_conflicts, '; ') using errcode = 'KC002', hint = 'An admin can override with a reason.';
    end if;
    if not private.is_admin() then
      raise exception 'blocked: % (only an admin can override)', array_to_string(v_conflicts, '; ') using errcode = 'KC002';
    end if;
    v_override := true;
  end if;

  select name into v_from_crew from public.crews where id = v_job.crew_id;
  select name into v_to_crew from public.crews where id = p_crew_id;

  update public.jobs
  set crew_id = p_crew_id, scheduled_start = p_start, scheduled_end = p_end
  where id = p_job_id
  returning updated_at into v_result;

  delete from public.job_assignments where job_id = p_job_id and subcontractor_id = any (v_removed);
  insert into public.job_assignments (job_id, subcontractor_id)
  select p_job_id, unnest(v_added);

  insert into public.activities (type, subject, body, job_id, actor_user_id)
  values (
    'status_change',
    case when v_override then 'Visit reassigned (override)' else 'Visit reassigned' end,
    format(
      'Crew: %s -> %s. Time: %s -> %s. Cleaners: %s -> %s.%s',
      coalesce(v_from_crew, 'unassigned'), coalesce(v_to_crew, 'unassigned'),
      to_char(v_job.scheduled_start at time zone 'America/New_York', 'Dy Mon DD HH12:MI AM'),
      to_char(p_start at time zone 'America/New_York', 'Dy Mon DD HH12:MI AM'),
      coalesce(array_length(v_old, 1), 0), coalesce(array_length(v_new, 1), 0),
      case when v_override then format(' Override of: %s. Reason: %s', array_to_string(v_conflicts, '; '), p_override_reason) else '' end
    ),
    p_job_id,
    (select auth.uid())
  );

  return v_result;
end;
$$;

revoke execute on function public.reassign_job(uuid, timestamptz, uuid, uuid[], timestamptz, timestamptz, text) from public, anon;
grant execute on function public.reassign_job(uuid, timestamptz, uuid, uuid[], timestamptz, timestamptz, text) to authenticated;
