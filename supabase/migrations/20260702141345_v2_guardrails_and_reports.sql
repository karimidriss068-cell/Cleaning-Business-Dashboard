-- MAKI Ops V2 — Part 2 & bridges: Fulfillment guardrails, alerts, reports.

-- Thresholds on accounts (per-client CPA guardrails).
alter table accounts
  add column cpa_alert_threshold numeric,
  add column auto_pause_threshold numeric;

-- Anti-spam timestamp on campaigns (only re-alert after 24h).
alter table campaigns
  add column last_alert_sent_at timestamptz;

-- Alert type enum + log table.
create type alert_type as enum ('cpa_warning', 'cpa_critical', 'zero_leads', 'other');

create table alerts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  type alert_type not null default 'other',
  message text not null,
  triggered_at timestamptz not null default now(),
  acknowledged boolean not null default false
);
create index alerts_campaign_id_idx on alerts (campaign_id);
create index alerts_acknowledged_idx on alerts (acknowledged);
create index alerts_triggered_at_idx on alerts (triggered_at);

-- Bridge: an outreach contact can convert into a real lead.
alter table outreach_contacts
  add column lead_id uuid references leads (id) on delete set null;

-- Outreach-sourced leads may have no ad campaign, so make campaign_id optional.
alter table leads alter column campaign_id drop not null;

-- Shareable, expiring, read-only client reports (public route reads via the
-- service-role client, scoped to one account + date range).
create table report_shares (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts (id) on delete cascade,
  token text not null unique,
  date_from date not null,
  date_to date not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index report_shares_token_idx on report_shares (token);
create index report_shares_account_id_idx on report_shares (account_id);

alter table alerts enable row level security;
alter table report_shares enable row level security;

create policy "authenticated full access" on alerts
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on report_shares
  for all to authenticated using (true) with check (true);
