import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronSecret } from "@/lib/webhook-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/invoice-overdue: Vercel Cron, daily. Marks sent and partially
 * paid invoices whose New York due date has passed as overdue (idempotent; the
 * database logs each change). The screens also derive overdue on the fly, so
 * this keeps the stored status honest for reports. Auth: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createAdminClient().rpc("mark_overdue_invoices");
  if (error) return NextResponse.json({ error: "Could not mark overdue invoices" }, { status: 500 });
  return NextResponse.json({ marked: data ?? 0 });
}
