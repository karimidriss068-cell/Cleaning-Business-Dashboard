-- The campaign list and recent-spend list from part 1 now also carry each
-- campaign's channel and each spend row's creative.
create or replace function private.growth_core(p_cash boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base as (select private.growth_core_base(p_cash) as b)
  select jsonb_set(
           jsonb_set(
             base.b, '{ads,campaigns}',
             coalesce((select jsonb_agg(e || jsonb_build_object('channel', (select c.channel from public.marketing_campaigns c where c.id = (e ->> 'id')::uuid)))
                       from jsonb_array_elements(base.b -> 'ads' -> 'campaigns') e), '[]')),
           '{ads,recent}',
           coalesce((select jsonb_agg(e || jsonb_build_object('creative', (select d.creative from public.marketing_daily_stats d where d.id = (e ->> 'id')::uuid)))
                     from jsonb_array_elements(base.b -> 'ads' -> 'recent') e), '[]'))
         || private.growth_extra(p_cash)
  from base
$$;
