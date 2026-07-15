-- Track which surface an /insights query came from (web chat, SMS, or the
-- new Retell voice agent) and the caller's phone number where applicable,
-- so the usage log stays meaningful as more channels get added on top of
-- the same shared monthly cap.
alter table insights_usage add column channel text not null default 'web';
alter table insights_usage add column caller_phone text;
