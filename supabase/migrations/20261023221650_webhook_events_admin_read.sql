-- webhook_events (migration 1) had RLS with no policies, which the security
-- advisor flags. Admins can now read it for debugging; writes stay
-- service-role only (inbound webhook handlers).

grant select on public.webhook_events to authenticated;

create policy "webhook_events: admin read"
  on public.webhook_events for select to authenticated
  using ((select private.is_admin()));
