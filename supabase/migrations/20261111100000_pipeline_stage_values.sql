-- Bid pipeline, part 1: two new stored stages. Kept separate because Postgres can't use a new enum
-- value in the transaction that adds it; the next migration remaps and rewrites the functions.
-- Stored values keep the existing convention (the app labels them): new = Lead, site_visit =
-- Site visit, quoted = Bid sent, follow_up = Follow-up, won = Won, lost = Lost.
-- 'contacted' stays in the enum (Postgres can't drop a value) but no row may hold it any more.
alter type public.lead_stage add value if not exists 'site_visit' after 'new';
alter type public.lead_stage add value if not exists 'follow_up' after 'quoted';
