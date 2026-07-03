-- Supabase advisor: outreach_contacts.lead_id is a foreign key with no
-- covering index, which hurts join/lookup performance as the table grows.
create index outreach_contacts_lead_id_idx on outreach_contacts (lead_id);
