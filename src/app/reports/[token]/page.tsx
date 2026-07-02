import { createAdminClient } from "@/lib/supabase/admin";
import { getReportData, type ReportData } from "@/lib/report";
import { money, num, perUnit, shortDate } from "@/lib/format";
import { Stat } from "@/components/stat";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-14">
      {children}
    </main>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <h1 className="font-heading text-xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </Shell>
  );
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return <ErrorState title="Report unavailable" message="Server not configured." />;
  }

  const { data: share } = await supabase
    .from("report_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!share) {
    return <ErrorState title="Report not found" message="This report link is invalid." />;
  }
  if (new Date(share.expires_at).getTime() < Date.now()) {
    return <ErrorState title="Link expired" message="This report link has expired." />;
  }

  const data = await getReportData(
    supabase,
    share.account_id,
    share.date_from,
    share.date_to,
  );
  if (!data) {
    return <ErrorState title="Report unavailable" message="Account not found." />;
  }

  return (
    <Shell>
      {/* Brand + heading */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-heading text-lg font-bold text-primary">MAKI</span>
          <span className="font-heading text-lg font-light text-muted-foreground">
            Ops
          </span>
        </div>
        <a
          href={`/reports/${token}/pdf`}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="h-4 w-4" /> Download PDF
        </a>
      </div>

      <h1 className="mt-8 font-heading text-3xl tracking-tight">
        {data.account.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Performance report
        {data.account.niche ? ` · ${data.account.niche}` : ""} ·{" "}
        {shortDate(data.from)} – {shortDate(data.to)}
      </p>

      <div className="my-8 border-t border-border" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total spend" value={money(data.spend)} />
        <Stat label="Leads" value={num(data.leads)} />
        <Stat label="Appointments booked" value={num(data.booked)} />
        <Stat label="Appointments showed" value={num(data.showed)} />
        <Stat label="Revenue" value={money(data.revenue)} />
        <Stat
          label="Cost / appointment"
          value={perUnit(data.spend, data.booked)}
          hero
        />
      </div>

      <div className="my-8 border-t border-border" />

      <ReportFunnel data={data} />

      <p className="mt-12 text-xs text-muted-foreground">
        Confidential — prepared for {data.account.name} by MAKI. This link
        expires {shortDate(share.expires_at)}.
      </p>
    </Shell>
  );
}

function ReportFunnel({ data }: { data: ReportData }) {
  const stages = [
    { label: "Leads", count: data.leads },
    { label: "Contacted", count: data.contacted },
    { label: "Qualified", count: data.qualified },
    { label: "Booked", count: data.booked },
    { label: "Showed", count: data.showed },
  ];
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Funnel
      </h2>
      <div className="flex h-40 items-end gap-3">
        {stages.map((s) => (
          <div key={s.label} className="flex flex-1 flex-col items-center justify-end">
            <span className="mb-2 text-sm tabular-nums">{num(s.count)}</span>
            <div
              className="w-full rounded-sm bg-[var(--accent-primary)]"
              style={{ height: `${Math.max((s.count / max) * 100, 4)}%` }}
            />
            <span className="mt-2 text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
