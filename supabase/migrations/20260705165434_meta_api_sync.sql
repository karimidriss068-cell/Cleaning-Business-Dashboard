-- Meta Marketing API integration: map campaigns to Meta's campaign_id and make
-- spend_daily upsertable per (campaign_id, date) so the daily sync job can
-- overwrite yesterday's numbers on retry instead of creating duplicates.

alter table campaigns add column meta_campaign_id text;
create unique index campaigns_meta_campaign_id_key on campaigns (meta_campaign_id)
  where meta_campaign_id is not null;

alter table spend_daily add constraint spend_daily_campaign_id_date_key unique (campaign_id, date);
