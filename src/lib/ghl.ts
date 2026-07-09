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
