-- Phase 2: lead response monitoring finding types for the daily digest.
alter type insights_digest_finding_type add value 'ghost_leads';
alter type insights_digest_finding_type add value 'slow_response';
