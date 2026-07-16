-- Focus Spaces: persistent per-account/initiative context so a conversation
-- inside one doesn't need to keep re-specifying "for Apex". Personal, same
-- real-ownership RLS reasoning as insights_sessions.
create table insights_spaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  account_id uuid references accounts (id) on delete set null,
  context_notes text,
  created_at timestamptz not null default now()
);
create index insights_spaces_user_id_idx on insights_spaces (user_id);
create index insights_spaces_account_id_idx on insights_spaces (account_id);

alter table insights_spaces enable row level security;
create policy "own spaces only" on insights_spaces
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tags a session to the Space it was started in, so Space history and
-- general/unscoped history are separately browsable. Null = general/unscoped.
alter table insights_sessions add column space_id uuid references insights_spaces (id) on delete set null;
create index insights_sessions_space_id_idx on insights_sessions (space_id);
