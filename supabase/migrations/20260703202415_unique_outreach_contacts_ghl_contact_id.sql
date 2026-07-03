-- Required for n8n's native Supabase "Upsert" (Postgres ON CONFLICT) to match
-- existing outreach_contacts rows by ghl_contact_id. NULLs remain unrestricted
-- (Postgres allows multiple NULLs in a unique column), so manually-created
-- contacts with no GHL ID are unaffected.
alter table outreach_contacts add constraint outreach_contacts_ghl_contact_id_key unique (ghl_contact_id);
