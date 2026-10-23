-- Idempotency ledger for every inbound webhook (see CLAUDE.md, rule 1).
--
-- Handler contract:
--   1. Verify the signature on the raw body.
--   2. Claim the event BEFORE any side effects:
--        insert into webhook_events (provider, event_id, payload_hash)
--        values ($1, $2, $3)
--        on conflict (provider, event_id) do update
--          set status = 'received', received_at = now(), error = null
--          where webhook_events.status = 'failed'
--        returning id;
--      No row returned = already received or processed -> respond 200 { duplicate: true }.
--      A previously failed event is re-claimed so the provider's retry can succeed.
--   3. On success set status = 'processed', processed_at = now().
--      On failure set status = 'failed' with the error and respond 5xx so the provider retries.
--
-- Only server code using the service role touches this table. RLS is enabled
-- with no policies, so anon and authenticated clients get nothing.

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9_]+$'),
  event_id text not null check (length(event_id) between 1 and 255),
  -- sha256 hex of the raw body; lets us spot a reused event_id carrying a different payload.
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'received'
    check (status in ('received', 'processed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint webhook_events_provider_event_id_key unique (provider, event_id)
);

-- Retention cleanup and "stuck in received" monitoring.
create index webhook_events_received_at_idx on public.webhook_events (received_at);
create index webhook_events_status_idx on public.webhook_events (status)
  where status <> 'processed';

alter table public.webhook_events enable row level security;

revoke all on table public.webhook_events from anon, authenticated;
