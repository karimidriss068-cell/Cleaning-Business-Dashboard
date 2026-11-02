-- The channel stream chart needs revenue by channel per week, not one total.
-- Replaces revenue_by_channel (nothing else used it). Same attribution: the
-- channel of the invoice contact's newest lead, else other. Office team only.
drop function public.revenue_by_channel(integer);
drop function private.revenue_by_channel(integer);

create function private.revenue_by_channel_weekly(p_days integer default 91)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_days integer := least(greatest(coalesce(p_days, 91), 7), 400);
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('week', t.week, 'channel', t.channel, 'cents', t.cents) order by t.week, t.channel)
    from (
      select date_trunc('week', i.issued_on)::date as week,
             coalesce((select l.channel from public.leads l where l.contact_id = i.contact_id order by l.created_at desc limit 1), 'other') as channel,
             sum(i.subtotal_cents - i.discount_cents)::bigint as cents
      from public.invoices i
      where i.status not in ('draft', 'void')
        and i.issued_on > v_today - v_days
      group by 1, 2
    ) t
  ), '[]'::jsonb);
end;
$$;

create function public.revenue_by_channel_weekly(p_days integer default 91)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.revenue_by_channel_weekly(p_days) $$;

revoke execute on function private.revenue_by_channel_weekly(integer), public.revenue_by_channel_weekly(integer) from public, anon;
grant execute on function private.revenue_by_channel_weekly(integer), public.revenue_by_channel_weekly(integer) to authenticated;
