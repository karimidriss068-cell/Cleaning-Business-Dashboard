-- Conversation history for the /insights chat UI (web mode only — SMS/voice
-- stay stateless, they already have their own usage log). This is personal
-- chat history, not shared team data, so unlike the rest of the app (which
-- uses a single blanket "authenticated = full access" RLS policy everywhere,
-- e.g. insights_usage) these tables get real per-owner RLS via auth.uid().
-- That's a deliberate departure: client-facing access is coming later, and
-- nobody should be able to read another user's questions once that lands —
-- retrofitting ownership RLS onto a table that started world-readable is a
-- much bigger migration than starting correct.
--
-- account_id is nullable and unused today (insights has no per-account scope
-- yet) — reserved so a future "ask about just this client" session mode
-- doesn't require another schema change.
create table insights_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references accounts (id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index insights_sessions_user_id_idx on insights_sessions (user_id);
create index insights_sessions_account_id_idx on insights_sessions (account_id);

alter table insights_sessions enable row level security;
create policy "own sessions only" on insights_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create type insights_message_role as enum ('user', 'assistant');

-- caveat/mentioned_entities/follow_ups mirror the shape of InsightsAnswer
-- (src/lib/insights-ask.ts) so a reloaded session renders identically to a
-- freshly-asked question, without recomputing anything against live data.
create table insights_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references insights_sessions (id) on delete cascade,
  role insights_message_role not null,
  content text not null,
  caveat text,
  mentioned_entities jsonb,
  follow_ups jsonb,
  created_at timestamptz not null default now()
);
create index insights_messages_session_id_idx on insights_messages (session_id);

alter table insights_messages enable row level security;
create policy "own messages only" on insights_messages
  for all to authenticated
  using (exists (
    select 1 from insights_sessions s
    where s.id = insights_messages.session_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from insights_sessions s
    where s.id = insights_messages.session_id and s.user_id = auth.uid()
  ));
