-- A real lead must never be attributed to a seeded demo campaign: the purge
-- would leave it pointing at nothing, and until then demo spend would be
-- counted against real leads. With no real campaign on the platform the lead
-- stays unattributed.
create or replace function private.attribute_lead_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_platform public.marketing_platform;
begin
  if new.campaign_id is not null or new.source is null then
    return new;
  end if;
  v_platform := (case new.source when 'instagram' then 'meta' when 'google' then 'google' when 'thumbtack' then 'thumbtack' end)::public.marketing_platform;
  if v_platform is null then
    return new;
  end if;
  select c.id into new.campaign_id
  from public.marketing_campaigns c
  where c.platform = v_platform and c.status = 'active' and c.id::text not like '5eed0000-%'
  order by c.start_date desc nulls last, c.created_at desc
  limit 1;
  return new;
end;
$$;
