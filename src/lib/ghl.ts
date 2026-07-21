const GHL_BASE_URL = "https://services.leadconnectorhq.com";

/**
 * Sends an SMS via GHL's Conversations API using a Private Integration Token.
 * Server-only — the token must never reach the browser.
 *
 * Endpoint contract verified against GoHighLevel/highlevel-api-docs
 * (apps/conversations.json): POST /conversations/messages, scope
 * conversations/message.write. Note the Version header for this specific
 * endpoint (2021-04-15) differs from other GHL v2 endpoints (e.g. workflow
 * removal uses 2021-07-28) — GHL versions per-endpoint, not globally.
 */
export async function sendGhlSms(contactId: string, message: string) {
  const token = process.env.GHL_API_TOKEN;
  if (!token) {
    throw new Error("GHL_API_TOKEN is not configured");
  }

  const res = await fetch(`${GHL_BASE_URL}/conversations/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-04-15",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "SMS",
      contactId,
      message,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (data && (data.message || data.error)) || `GHL API error (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

/**
 * Sets a checkbox-type custom field on a GHL contact via the Update Contact
 * API. Server-only — the token must never reach the browser.
 *
 * Endpoint contract verified against GoHighLevel/highlevel-api-docs
 * (apps/contacts.json): PUT /contacts/{contactId}, scope contacts.write,
 * Version header 2021-07-28 — a different version than sendGhlSms's
 * endpoint (2021-04-15); GHL versions per-endpoint, not globally.
 *
 * GHL checkbox fields store their value as an ARRAY of the selected
 * option(s)' string values, not a boolean — per the CheckboxField schema's
 * `field_value: string[]` (checked = the option's value(s) in the array,
 * unchecked = an empty array). The schema also marks the field's internal
 * `id` as required, not `key` — the caller must resolve the real GHL custom
 * field id (from GHL's Custom Fields settings, or the "Get Custom Fields"
 * API), a key string alone isn't a documented-valid substitute.
 */
export async function setGhlContactCheckboxField(
  contactId: string,
  fieldId: string,
  values: string[],
) {
  const token = process.env.GHL_API_TOKEN;
  if (!token) {
    throw new Error("GHL_API_TOKEN is not configured");
  }

  const res = await fetch(`${GHL_BASE_URL}/contacts/${contactId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customFields: [{ id: fieldId, field_value: values }],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (data && (data.message || data.error)) || `GHL API error (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

/**
 * Checks/unchecks the "Awaiting Job Followup" checkbox (key
 * awaiting_job_followup, one option with value "true") — GHL-side scoping
 * for the workflow that fires the follow-up-reply webhook, so it can be
 * filtered to only contacts genuinely awaiting a reply rather than every
 * inbound text. Requires GHL_AWAITING_JOB_FOLLOWUP_FIELD_ID (the field's
 * real GHL id, not its key — see setGhlContactCheckboxField).
 */
export async function setGhlAwaitingJobFollowup(contactId: string, awaiting: boolean) {
  const fieldId = process.env.GHL_AWAITING_JOB_FOLLOWUP_FIELD_ID;
  if (!fieldId) {
    throw new Error("GHL_AWAITING_JOB_FOLLOWUP_FIELD_ID is not configured");
  }
  return setGhlContactCheckboxField(contactId, fieldId, awaiting ? ["true"] : []);
}
