import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/appointment-booked
 *
 * Called by n8n when a GHL appointment is booked. Auth is a shared secret in
 * the `x-webhook-secret` header (must equal N8N_WEBHOOK_SECRET).
 *
 * Body: { lead_id, account_id, appointment_date, ghl_appointment_id? }
 *
 * Looks up the account's price_per_appointment, creates an appointment
 * (status 'booked', revenue_owed pre-filled), flips the lead to 'booked',
 * and returns the created appointment.
 */
export async function POST(req: NextRequest) {
  // 1. Authenticate the webhook.
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate the body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lead_id, account_id, appointment_date, ghl_appointment_id } =
    (body ?? {}) as {
      lead_id?: string;
      account_id?: string;
      appointment_date?: string;
      ghl_appointment_id?: string;
    };

  if (!lead_id || !account_id) {
    return NextResponse.json(
      { error: "Missing required fields: lead_id and account_id" },
      { status: 400 },
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Server not configured (missing service role key)" },
      { status: 500 },
    );
  }

  // 3. Look up the account's price_per_appointment.
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("price_per_appointment")
    .eq("id", account_id)
    .single();

  if (accountError || !account) {
    return NextResponse.json(
      { error: "Account not found" },
      { status: 404 },
    );
  }

  // 4. Create the appointment (revenue_owed pre-filled from the account price).
  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .insert({
      lead_id,
      account_id,
      appointment_date: appointment_date ?? null,
      ghl_appointment_id: ghl_appointment_id ?? null,
      status: "booked",
      revenue_owed: account.price_per_appointment,
    })
    .select()
    .single();

  if (appointmentError || !appointment) {
    return NextResponse.json(
      { error: "Could not create appointment", detail: appointmentError?.message },
      { status: 500 },
    );
  }

  // 5. Flip the linked lead to 'booked'.
  const { error: leadError } = await supabase
    .from("leads")
    .update({ status: "booked" })
    .eq("id", lead_id);

  return NextResponse.json(
    {
      appointment,
      lead_updated: !leadError,
      ...(leadError ? { lead_update_error: leadError.message } : {}),
    },
    { status: 201 },
  );
}
