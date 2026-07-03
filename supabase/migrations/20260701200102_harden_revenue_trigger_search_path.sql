-- Harden set_appointment_revenue_owed() against a mutable search_path
-- (Supabase linter: function_search_path_mutable). Pins search_path to public
-- so the function can't be tricked by a session-level search_path override.
create or replace function set_appointment_revenue_owed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.revenue_owed is null then
    select a.price_per_appointment
      into new.revenue_owed
      from accounts a
     where a.id = new.account_id;
  end if;
  return new;
end;
$$;
