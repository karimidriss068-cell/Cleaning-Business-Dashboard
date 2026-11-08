-- Bid pipeline, part 2: commercial project work. Leads become the opportunity record (stages Lead,
-- Site visit, Bid sent, Follow-up, Won, Lost), with bid dates and an expected value; accounts get a
-- type and a referral source. Residential rows are kept and hidden by the app, never deleted.
-- Every function that listed the open stages is rewritten in place (asserted, so a missed spot fails
-- the migration instead of silently leaving old behavior).

-- 'contacted' folds into Lead. Reaching out is tracked by first_response_at, not by a stage.
update public.leads set stage = 'new', stage_changed_at = now() where stage = 'contacted';
alter table public.leads add constraint leads_stage_not_legacy check (stage <> 'contacted');

alter table public.leads
  add column bid_due_on date,
  add column site_visit_at timestamptz,
  add column expected_value_cents bigint check (expected_value_cents is null or expected_value_cents >= 0),
  -- Null means "use the stage default" (src/lib/pipeline.ts); a number is the owner's own estimate.
  add column win_probability_bps integer check (win_probability_bps is null or win_probability_bps between 0 and 10000),
  add column account_id uuid references public.accounts (id) on delete set null;
create index leads_account_id_idx on public.leads (account_id) where account_id is not null;
create index leads_bid_due_idx on public.leads (bid_due_on) where bid_due_on is not null;

alter table public.accounts
  add column account_type text check (account_type is null or account_type in ('general_contractor', 'property_manager', 'developer', 'facilities_manager', 'other')),
  add column referral_source text check (referral_source is null or length(btrim(referral_source)) > 0);

drop index public.leads_follow_up_idx;
create index leads_follow_up_idx on public.leads (next_follow_up_on) where stage in ('new', 'site_visit', 'quoted', 'follow_up');

create or replace function private.stage_label(s public.lead_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s when 'new' then 'Lead' when 'site_visit' then 'Site visit' when 'contacted' then 'Lead' when 'quoted' then 'Bid sent'
    when 'follow_up' then 'Follow-up' when 'won' then 'Won' else 'Lost' end
$$;

do $patch$
declare
  edits jsonb := $e$[
    {"fn": "public.move_lead_stage", "old": "p_stage in ('contacted', 'quoted', 'won')", "new": "p_stage in ('site_visit', 'quoted', 'follow_up', 'won')"},
    {"fn": "public.ghl_apply_stage", "old": "p_stage in ('contacted', 'quoted', 'won')", "new": "p_stage in ('site_visit', 'quoted', 'follow_up', 'won')"},
    {"fn": "public.ghl_apply_stage", "old": "p_stage not in ('new', 'contacted', 'quoted', 'won', 'lost')", "new": "p_stage not in ('new', 'site_visit', 'quoted', 'follow_up', 'won', 'lost')"},
    {"fn": "private.save_ghl_settings", "old": "k not in ('new', 'contacted', 'quoted', 'won', 'lost')", "new": "k not in ('new', 'site_visit', 'quoted', 'follow_up', 'won', 'lost')"},
    {"fn": "private.growth_extra", "old": "l.stage in ('contacted', 'quoted', 'won')", "new": "l.stage in ('site_visit', 'quoted', 'follow_up', 'won')"},
    {"fn": "private.growth_extra", "old": "a.subject like '% -> Quote sent'", "new": "(a.subject like '% -> Quote sent' or a.subject like '% -> Bid sent')"},
    {"fn": "private.growth_extra", "old": "l.stage in ('quoted', 'won')", "new": "l.stage in ('quoted', 'follow_up', 'won')"},
    {"fn": "public.lead_conversion_by_source", "old": "l.stage in ('new', 'contacted', 'quoted')", "new": "l.stage in ('new', 'site_visit', 'quoted', 'follow_up')"},
    {"fn": "public.ghl_upsert_lead", "old": "stage in ('new', 'contacted', 'quoted')", "new": "stage in ('new', 'site_visit', 'quoted', 'follow_up')"},
    {"fn": "public.ghl_log_message", "old": "stage in ('new', 'contacted', 'quoted')", "new": "stage in ('new', 'site_visit', 'quoted', 'follow_up')"},
    {"fn": "public.ghl_log_appointment", "old": "stage in ('new', 'contacted', 'quoted')", "new": "stage in ('new', 'site_visit', 'quoted', 'follow_up')"},
    {"fn": "private.lead_duplicates", "old": "l.stage in ('new', 'contacted', 'quoted')", "new": "l.stage in ('new', 'site_visit', 'quoted', 'follow_up')"},
    {"fn": "public.convert_lead", "old": "set stage = case when stage = 'new' then 'contacted' else stage end,", "new": "set stage = stage,"},
    {"fn": "public.convert_lead", "old": "stage_changed_at = case when stage = 'new' then now() else stage_changed_at end,", "new": "stage_changed_at = stage_changed_at,"},
    {"fn": "public.update_lead", "old": "'bathrooms', 'sqft'];", "new": "'bathrooms', 'sqft', 'bid_due_on', 'site_visit_at', 'expected_value_cents', 'win_probability_bps', 'account_id'];"},
    {"fn": "public.update_lead", "old": "sqft = case when p_patch ? 'sqft' then (p_patch->>'sqft')::integer else sqft end", "new": "sqft = case when p_patch ? 'sqft' then (p_patch->>'sqft')::integer else sqft end,\n    bid_due_on = case when p_patch ? 'bid_due_on' then (p_patch->>'bid_due_on')::date else bid_due_on end,\n    site_visit_at = case when p_patch ? 'site_visit_at' then (p_patch->>'site_visit_at')::timestamptz else site_visit_at end,\n    expected_value_cents = case when p_patch ? 'expected_value_cents' then (p_patch->>'expected_value_cents')::bigint else expected_value_cents end,\n    win_probability_bps = case when p_patch ? 'win_probability_bps' then (p_patch->>'win_probability_bps')::integer else win_probability_bps end,\n    account_id = case when p_patch ? 'account_id' then (p_patch->>'account_id')::uuid else account_id end"}
  ]$e$::jsonb;
  e jsonb;
  v_oid oid;
  v_def text;
  v_schema text;
  v_name text;
begin
  for e in select * from jsonb_array_elements(edits) loop
    v_schema := split_part(e->>'fn', '.', 1);
    v_name := split_part(e->>'fn', '.', 2);
    select p.oid into strict v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = v_schema and p.proname = v_name;
    v_def := pg_get_functiondef(v_oid);
    if position(e->>'old' in v_def) = 0 then
      raise exception 'pipeline migration: % no longer contains %', e->>'fn', e->>'old';
    end if;
    execute replace(v_def, e->>'old', e->>'new');
  end loop;
end
$patch$;

-- The glass migration was recorded remotely under another version number, so it sorts earlier than
-- the Vault one; restate the default here so "the last migration to set it" is Glass Cyan again.
alter table public.user_preferences alter column direction set default 'glass-cyan-dark';
