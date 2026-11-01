-- A lead counts as "quote sent" in the funnel if it ever reached that stage (the
-- timeline says so) or has a sent quote, even if it was lost afterwards.
do $$
declare
  v_def text := pg_get_functiondef('private.growth_extra(boolean)'::regprocedure);
  v_old text := $q$(l.stage in ('quoted', 'won') or exists (select 1 from public.quotes q where q.lead_id = l.id and q.status <> 'draft')) as quoted$q$;
  v_new text := $q$(l.stage in ('quoted', 'won') or exists (select 1 from public.quotes q where q.lead_id = l.id and q.status <> 'draft')
                or exists (select 1 from public.activities a where a.lead_id = l.id and a.type = 'status_change' and a.subject like '% -> Quote sent')) as quoted$q$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'growth_extra no longer has the expected quoted expression';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
