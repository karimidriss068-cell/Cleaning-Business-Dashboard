-- Saved/pinned insight answers — personal, same real-ownership RLS reasoning
-- as insights_sessions (see that migration's comment).
create table insights_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id uuid not null references insights_messages (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  unique (user_id, message_id)
);
create index insights_pins_user_id_idx on insights_pins (user_id);

alter table insights_pins enable row level security;
create policy "own pins only" on insights_pins
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
