-- Usage log for the /insights AI feature — one row per query, attributed to
-- the Supabase Auth user who asked it (today: you and your partner; later:
-- individual client logins). Backs a monthly-per-user query cap and a cost
-- visibility view, since a single shared Anthropic API key currently pays
-- for every query from every logged-in user.
create table insights_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text not null,
  question text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index insights_usage_user_id_created_at_idx on insights_usage (user_id, created_at);

alter table insights_usage enable row level security;

-- Same "authenticated = full access" model as the rest of the app (single
-- internal team today) — every logged-in user can see everyone's usage, not
-- just their own, since the operator needs total visibility across users.
create policy "authenticated full access" on insights_usage
  for all to authenticated using (true) with check (true);
