-- Goal metrics for the owner's targets: Google reviews, residential jobs
-- completed, and commercial contracts signed. Values are added, never removed,
-- so existing goals are unaffected.
--
-- Actuals: residential jobs come from jobs (status completed, contact on a
-- residential contact); commercial contracts from accounts moving to active.
-- Google reviews have no data source yet (needs a Google Business Profile or
-- GHL reputation integration).

alter type public.goal_metric add value if not exists 'google_reviews';
alter type public.goal_metric add value if not exists 'residential_jobs_completed';
alter type public.goal_metric add value if not exists 'commercial_contracts_signed';
