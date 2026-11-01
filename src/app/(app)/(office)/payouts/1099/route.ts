import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { financeContext } from "@/lib/finance-auth";
import { load1099, loadSettings } from "@/lib/finance-data";
import { build1099Csv } from "@/lib/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const yearSchema = z.coerce.number().int().min(2000).max(2200);

/** GET /payouts/1099?year=2026: the year's totals per subcontractor as a CSV for the accountant. Owner/admin only. */
export async function GET(req: NextRequest) {
  const ctx = await financeContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ctx.isAdmin) return NextResponse.json({ error: "Only the owner or an admin can export this" }, { status: 403 });
  const year = yearSchema.safeParse(req.nextUrl.searchParams.get("year"));
  if (!year.success) return NextResponse.json({ error: "Pass ?year=YYYY", issues: year.error.flatten() }, { status: 400 });
  const [rows, settings] = await Promise.all([load1099(ctx.supabase, year.data), loadSettings(ctx.supabase)]);
  const csv = build1099Csv({
    year: year.data,
    thresholdCents: settings.thresholdCents,
    warnBps: settings.warnBps,
    rows: rows.map((r) => ({ displayName: r.displayName, legalName: r.legalName, businessEntity: r.businessEntity, w9OnFile: r.w9OnFile, paidCents: r.paidCents, approvedCents: r.approvedCents })),
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="1099-totals-${year.data}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
