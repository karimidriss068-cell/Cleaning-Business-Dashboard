-- Analyst Mode ("Run a full analysis") output — a structured report, not a
-- chat turn, so it lives in its own table rather than insights_sessions.
-- Personal, same real-ownership RLS reasoning as insights_sessions.
-- space_id scopes a report to the Space it was generated in (nullable —
-- most reports cover the whole business).
create table insights_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  space_id uuid references insights_spaces (id) on delete set null,
  content text not null,
  caveat text,
  mentioned_entities jsonb,
  follow_ups jsonb,
  created_at timestamptz not null default now()
);
create index insights_reports_user_id_idx on insights_reports (user_id);
create index insights_reports_space_id_idx on insights_reports (space_id);

alter table insights_reports enable row level security;
create policy "own reports only" on insights_reports
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
