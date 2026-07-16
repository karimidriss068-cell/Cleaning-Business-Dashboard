create type insights_digest_finding_type as enum ('zero_leads', 'cpa_above_threshold', 'creative_cpa_spike');

-- Account-level findings from the daily digest job — like alerts, this is
-- shared team data, not personal, so it stays on the app's existing blanket
-- "authenticated = full access" RLS model rather than the per-owner model
-- used for insights_sessions/messages/pins.
create table insights_digest (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete cascade,
  creative_id uuid references creatives (id) on delete cascade,
  finding_type insights_digest_finding_type not null,
  message text not null,
  digest_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index insights_digest_account_id_idx on insights_digest (account_id);
create index insights_digest_date_idx on insights_digest (digest_date);

alter table insights_digest enable row level security;
create policy "authenticated full access" on insights_digest
  for all to authenticated using (true) with check (true);

-- Per-user dismissal, deliberately a separate table from insights_digest:
-- dismissing is personal ("I've seen this"), the finding itself is shared —
-- one user dismissing a flag must not hide it for every other user once
-- client-facing access exists. Real ownership RLS, same reasoning as
-- insights_sessions.
create table insights_digest_dismissals (
  id uuid primary key default gen_random_uuid(),
  digest_id uuid not null references insights_digest (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique (digest_id, user_id)
);
create index insights_digest_dismissals_user_id_idx on insights_digest_dismissals (user_id);

alter table insights_digest_dismissals enable row level security;
create policy "own dismissals only" on insights_digest_dismissals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
