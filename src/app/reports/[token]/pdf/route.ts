import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReportData } from "@/lib/report";
import { reportPdfBuffer } from "@/lib/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return new NextResponse("Server not configured", { status: 500 });
  }

  const { data: share } = await supabase
    .from("report_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!share) return new NextResponse("Report not found", { status: 404 });
  if (new Date(share.expires_at).getTime() < Date.now()) {
    return new NextResponse("This report link has expired", { status: 410 });
  }

  const data = await getReportData(
    supabase,
    share.account_id,
    share.date_from,
    share.date_to,
  );
  if (!data) return new NextResponse("Account not found", { status: 404 });

  const buffer = await reportPdfBuffer(data);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="maki-report-${share.date_from}-to-${share.date_to}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
