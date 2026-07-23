import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSecret } from "@/lib/webhook-auth";
import { findOrCreatePatient } from "@/lib/patients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/package-sold
 *
 * Called by n8n when a GHL workflow records a package/membership purchase.
 * Auth is a shared secret in the `x-webhook-secret` header (must equal
 * N8N_WEBHOOK_SECRET), same as the other GHL-driven webhooks.
 *
 * Body (exact GHL shape unconfirmed until tested against a live payload —
 * see the [package-sold-debug] logging below, remove once confirmed):
 *   {
 *     contact_id: string,
 *     account_id: string,
 *     package_name: string,
 *     sessions_total: number | string,
 *     price?: number | string,
 *     purchase_date?: string,
 *     expiration_date?: string,
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
 * If expiration_date isn't provided, it is left null rather than guessed —
 * the UI already treats a null expiration_date as "no expiration set".
 * purchase_date, if omitted, is left out of the insert entirely so the
 * table's own `default current_date` applies.
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
    "[package-sold-debug] content-type:",
    JSON.stringify(req.headers.get("content-type")),
  );
  console.log("[package-sold-debug] raw body text:", JSON.stringify(rawText));

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : undefined;
    console.log("[package-sold-debug] parsed as JSON:", JSON.stringify(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    contact_id,
    account_id,
    package_name,
    sessions_total,
    price,
    purchase_date,
    expiration_date,
    patient_name,
    patient_phone,
    customData,
  } = (body ?? {}) as {
    contact_id?: string;
    account_id?: string;
    package_name?: string;
    sessions_total?: string | number;
    price?: string | number;
    purchase_date?: string;
    expiration_date?: string;
    patient_name?: string;
    patient_phone?: string;
    customData?: {
      contact_id?: string;
      account_id?: string;
      package_name?: string;
      sessions_total?: string | number;
      price?: string | number;
      purchase_date?: string;
      expiration_date?: string;
      patient_name?: string;
      patient_phone?: string;
    };
  };

  const resolvedContactId = contact_id || customData?.contact_id;
  const resolvedAccountId = account_id || customData?.account_id;
  const resolvedPackageName = package_name || customData?.package_name;
  const resolvedSessionsTotalRaw = sessions_total || customData?.sessions_total;
  const resolvedPrice = price || customData?.price;
  const resolvedPurchaseDate = purchase_date || customData?.purchase_date;
  const resolvedExpirationDate = expiration_date || customData?.expiration_date;
  const resolvedPatientName = patient_name || customData?.patient_name;
  const resolvedPatientPhone = patient_phone || customData?.patient_phone;

  console.log(
    "[package-sold-debug] extracted fields:",
    JSON.stringify({
      resolvedContactId,
      resolvedAccountId,
      resolvedPackageName,
      resolvedSessionsTotalRaw,
      resolvedPrice,
      resolvedPurchaseDate,
      resolvedExpirationDate,
    }),
  );

  const sessionsTotal =
    resolvedSessionsTotalRaw !== undefined ? Number(resolvedSessionsTotalRaw) : NaN;

  if (
    !resolvedContactId ||
    !resolvedAccountId ||
    !resolvedPackageName ||
    !Number.isFinite(sessionsTotal)
  ) {
    return NextResponse.json(
      {
        error:
          "Missing or invalid required fields: contact_id, account_id, package_name, and sessions_total (must be a number)",
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

    const priceValue = resolvedPrice !== undefined ? Number(resolvedPrice) : null;

    const { data: pkg, error: packageError } = await supabase
      .from("packages")
      .insert({
        patient_id: patientId,
        account_id: resolvedAccountId,
        package_name: resolvedPackageName,
        sessions_total: sessionsTotal,
        price: priceValue !== null && Number.isFinite(priceValue) ? priceValue : null,
        ...(resolvedPurchaseDate ? { purchase_date: resolvedPurchaseDate } : {}),
        expiration_date: resolvedExpirationDate ?? null,
      })
      .select()
      .single();

    if (packageError || !pkg) {
      return NextResponse.json(
        { error: "Could not create package", detail: packageError?.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Unexpected error processing package-sold webhook",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
