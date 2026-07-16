-- data_available mirrors InsightsAnswer.data_available so a reloaded session
-- shows the same "not answerable from current data" banner as when the
-- answer was first asked, instead of silently losing it on reload.
alter table insights_messages add column data_available boolean not null default true;
