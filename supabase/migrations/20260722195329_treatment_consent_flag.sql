-- Phase 6: consent/compliance tracking, tied to the specific treatment
-- performed (not the marketing appointment) since consent forms are
-- procedure-specific (a Botox consent differs from a filler consent).
alter table treatments add column consent_on_file boolean not null default false;
alter table treatments add column consent_date date;

-- New digest finding type — kept visually/tonally distinct in the UI from
-- performance-oriented findings, since this is a compliance/risk matter.
alter type insights_digest_finding_type add value 'consent_missing';
