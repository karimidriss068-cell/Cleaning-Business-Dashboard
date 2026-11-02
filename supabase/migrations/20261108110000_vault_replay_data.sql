-- Read-only data for the Vault screens: revenue per New York day (same
-- definition as growth_revenue_cents, so the days add up to the month figure
-- the pace uses) for the replay timeline, and revenue by acquisition channel
-- for the 3D chart. Office team only; nothing is written.

create function private.daily_revenue(p_days integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_days integer := least(greatest(coalesce(p_days, 60), 1), 400);
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('day', d.day, 'cents',
             private.growth_revenue_cents(d.day, d.day + 1)) order by d.day)
    from (select generate_series(v_today - (v_days - 1), v_today, interval '1 day')::date as day) d
  ), '[]'::jsonb);
end;
$$;

create function private.revenue_by_channel(p_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_days integer := least(greatest(coalesce(p_days, 90), 1), 400);
begin
  if not private.is_staff() then
    raise exception 'not allowed' using errcode = 'KC004';
  end if;
  -- An invoice belongs to the channel of its contact's newest lead; invoices
  -- with no lead behind them (walk-ins, commercial accounts) count as other.
  return coalesce((
    select jsonb_agg(jsonb_build_object('channel', t.channel, 'cents', t.cents, 'invoices', t.n) order by t.cents desc)
    from (
      select coalesce((select l.channel from public.leads l where l.contact_id = i.contact_id order by l.created_at desc limit 1), 'other') as channel,
             sum(i.subtotal_cents - i.discount_cents)::bigint as cents,
             count(*)::integer as n
      from public.invoices i
      where i.status not in ('draft', 'void')
        and i.issued_on > v_today - v_days
      group by 1
    ) t
  ), '[]'::jsonb);
end;
$$;

create function public.daily_revenue(p_days integer default 60)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.daily_revenue(p_days) $$;

create function public.revenue_by_channel(p_days integer default 90)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.revenue_by_channel(p_days) $$;

revoke execute on function private.daily_revenue(integer), private.revenue_by_channel(integer),
  public.daily_revenue(integer), public.revenue_by_channel(integer) from public, anon;
grant execute on function private.daily_revenue(integer), private.revenue_by_channel(integer),
  public.daily_revenue(integer), public.revenue_by_channel(integer) to authenticated;
