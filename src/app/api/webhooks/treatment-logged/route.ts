import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { findOrCreatePatient } from "@/lib/patients";
import { findProviderByName } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/treatment-logged
 *
 * Called by n8n when a GHL workflow logs a completed treatment. Auth is a
 * shared secret in the `x-webhook-secret` header (must equal
 * N8N_WEBHOOK_SECRET), same as the other GHL-driven webhooks.
 *
 * Body (exact GHL shape unconfirmed until tested against a live payload —
 * see the [treatment-logged-debug] logging below, remove once confirmed):
 *   {
 *     contact_id: string,
 *     account_id: string,
 *     treatment_type: string,
 *     provider_name?: string,
 *     provider_id?: string,
 *     treatment_date?: string,
 *     patient_name?: string,
 *     patient_phone?: string,
 *     customData?: { ...same field names, fallback only }
 *   }
 *
 * Every field is read from its top-level key first, falling back to
 * customData only if missing — a Custom Data field wired to a merge tag has
 * been confirmed to silently resolve empty even though it looks populated
 * in the workflow UI (see job-followup-reply / /api/insights/sms history),
 * so top-level is the source of truth, not Custom Data.
 *
 * Looks up or creates the patient by (account_id, ghl_contact_id) — reusing
 * the Phase 1 dedup helper — looks up the provider by case-insensitive name
 * (never creates one; logs a warning and inserts provider_id null on no
 * match rather than failing the request), and best-effort links the
 * treatment to a matching appointment for that contact on the same
 * calendar day as treatment_date.
 */
export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TEMP DEBUG LOGGING — remove once this trigger's real GHL payload shape
  // is confirmed against a few live requests, same pattern used to debug
  // job-followup-reply and /api/insights/sms. Reads the body as raw text
  // ONCE (the request stream can only be consumed once), logs it, then
  // parses it as JSON from that same text.
  const rawText = await req.text();
  console.log(
    "[treatment-logged-debug] content-type:",
    JSON.stringify(req.headers.get("content-type")),
  );
  console.log("[treatment-logged-debug] raw body text:", JSON.stringify(rawText));

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : undefined;
    console.log("[treatment-logged-debug] parsed as JSON:", JSON.stringify(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    contact_id,
    account_id,
    treatment_type,
    provider_name,
    provider_id,
    treatment_date,
    patient_name,
    patient_phone,
    customData,
  } = (body ?? {}) as {
    contact_id?: string;
    account_id?: string;
    treatment_type?: string;
    provider_name?: string;
    provider_id?: string;
    treatment_date?: string;
    patient_name?: string;
    patient_phone?: string;
    customData?: {
      contact_id?: string;
      account_id?: string;
      treatment_type?: string;
      provider_name?: string;
      provider_id?: string;
      treatment_date?: string;
      patient_name?: string;
      patient_phone?: string;
    };
  };

  const resolvedContactId = contact_id || customData?.contact_id;
  const resolvedAccountId = account_id || customData?.account_id;
  const resolvedTreatmentType = treatment_type || customData?.treatment_type;
  const resolvedProviderName = provider_name || customData?.provider_name;
  const resolvedProviderId = provider_id || customData?.provider_id;
  const resolvedTreatmentDate = treatment_date || customData?.treatment_date;
  const resolvedPatientName = patient_name || customData?.patient_name;
  const resolvedPatientPhone = patient_phone || customData?.patient_phone;

  console.log(
    "[treatment-logged-debug] extracted fields:",
    JSON.stringify({
      resolvedContactId,
      resolvedAccountId,
      resolvedTreatmentType,
      resolvedProviderName,
      resolvedProviderId,
      resolvedTreatmentDate,
    }),
  );

  if (!resolvedContactId || !resolvedAccountId || !resolvedTreatmentType) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: contact_id, account_id, and treatment_type",
      },
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

  try {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", resolvedAccountId)
      .single();
    if (accountError || !account) {
      return NextResponse.json(
        { error: "Account not found", detail: accountError?.message },
        { status: 404 },
      );
    }

    const patientId = await findOrCreatePatient(supabase, {
      accountId: resolvedAccountId,
      ghlContactId: resolvedContactId,
      name: resolvedPatientName ?? null,
      phone: resolvedPatientPhone ?? null,
    });

    let matchedProviderId: string | null = resolvedProviderId ?? null;
    if (!matchedProviderId && resolvedProviderName) {
      matchedProviderId = await findProviderByName(
        supabase,
        resolvedAccountId,
        resolvedProviderName,
      );
      if (!matchedProviderId) {
        console.warn(
          `[treatment-logged] No provider matched name "${resolvedProviderName}" for account ${resolvedAccountId} — inserting treatment with provider_id null.`,
        );
      }
    }

    const appointmentId = await findMatchingAppointmentId(
      supabase,
      resolvedAccountId,
      resolvedContactId,
      resolvedTreatmentDate,
    );

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments")
      .insert({
        patient_id: patientId,
        account_id: resolvedAccountId,
        appointment_id: appointmentId,
        treatment_type: resolvedTreatmentType,
        provider_id: matchedProviderId,
        treatment_date: resolvedTreatmentDate ?? null,
      })
      .select()
      .single();

    if (treatmentError || !treatment) {
      return NextResponse.json(
        { error: "Could not create treatment", detail: treatmentError?.message },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        treatment,
        provider_matched: !!matchedProviderId,
        appointment_matched: !!appointmentId,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Unexpected error processing treatment-logged webhook",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

/**
 * Best-effort match: finds the contact's lead(s) by ghl_contact_id (no
 * unique constraint on that column, so a contact can have more than one
 * lead row), then looks for an appointment on one of those leads, scoped to
 * this account, whose appointment_date falls on the same calendar day as
 * treatment_date. Returns null (never throws) if treatment_date is missing
 * or nothing matches — appointment_id is nullable by design for exactly
 * this case.
 */
async function findMatchingAppointmentId(
  supabase: ReturnType<typeof createAdminClient>,
  accountId: string,
  ghlContactId: string,
  treatmentDate: string | undefined,
): Promise<string | null> {
  if (!treatmentDate) return null;

  const { data: leads } = await supabase
    .from("leads")
    .select("id")
    .eq("ghl_contact_id", ghlContactId);
  if (!leads || leads.length === 0) return null;

  const { data: appointments } = await supabase
    .from("appointments")
    .select("id, appointment_date")
    .in(
      "lead_id",
      leads.map((l) => l.id),
    )
    .eq("account_id", accountId);
  if (!appointments) return null;

  const targetDay = treatmentDate.slice(0, 10);
  const match = appointments.find(
    (a) => a.appointment_date && a.appointment_date.slice(0, 10) === targetDay,
  );
  return match?.id ?? null;
}
