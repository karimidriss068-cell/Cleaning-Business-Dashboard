import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarX2, CheckCircle2, MessageSquareWarning, Receipt, ShieldAlert, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatCents, formatNyDate, formatNyTime, nyDateString, nyDayRangeUtc, nyToday } from "@/lib/format";
import { cumulative, dailySeries, dayRange, direction, median, minutesBetween, shortDuration, signedCount, signedPercent } from "@/lib/command-center";
import { coiTone, jobLabel, jobTone } from "@/lib/status";
import { PageHeader } from "@/components/shell/page-header";
import { StatTile } from "@/components/system/stat-tile";
import { StatusPill } from "@/components/system/status-pill";
import { EmptyState } from "@/components/system/empty-state";
import { DataTable } from "@/components/system/data-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Database } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Command Center" };
export const dynamic = "force-dynamic";

type GoalMetric = Database["public"]["Enums"]["goal_metric"];
const GOAL_LABELS: Record<GoalMetric, string> = {
  google_reviews: "Google reviews",
  residential_jobs_completed: "Residential jobs completed",
  commercial_contracts_signed: "Commercial contracts signed",
  revenue_cents: "Revenue",
  jobs_completed: "Jobs completed",
  leads: "New leads",
  new_clients: "New clients",
  close_rate_bps: "Close rate",
  avg_first_response_minutes: "Average first response",
};

const dollars = (cents: number) => formatCents(Math.round(cents / 100) * 100, { hideZeroCents: true });

export default async function CommandCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profile?.role === "subcontractor") redirect("/my-jobs");
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6">
        <div className="rounded-md border border-border bg-surface">
          <EmptyState icon={UserX} title="Your login isn't on the team yet">
            You&apos;re signed in, but no team profile is linked to this account, so there&apos;s nothing to show. Ask the owner to add you.
          </EmptyState>
        </div>
      </div>
    );
  }

  const now = new Date();
  const today = nyToday(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const sparkStart = addDays(today, -13);
  const windowStart = monthStart < sparkStart ? monthStart : sparkStart;
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const lastMonthSameDay = addDays(lastMonthStart, Number(today.slice(8, 10)) - 1);
  const todayRange = nyDayRangeUtc(today);
  const in30 = addDays(today, 30);

  const [jobsRes, lastMonthRes, leadsRes, openLeadsRes, waitingRes, invoicesRes, goalsRes, contractsRes, coiRes] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, scheduled_start, scheduled_end, status, price_cents, account_id, contact:contacts(first_name, last_name), account:accounts(name), property:properties(borough), crew:crews(name), job_assignments(id, subcontractor:subcontractors(display_name))",
      )
      .gte("scheduled_start", nyDayRangeUtc(windowStart).start.toISOString())
      .lt("scheduled_start", nyDayRangeUtc(addDays(today, 7)).end.toISOString())
      .order("scheduled_start"),
    supabase
      .from("jobs")
      .select("price_cents")
      .eq("status", "completed")
      .gte("scheduled_start", nyDayRangeUtc(lastMonthStart).start.toISOString())
      .lt("scheduled_start", nyDayRangeUtc(lastMonthSameDay).end.toISOString()),
    supabase.from("leads").select("created_at, first_response_at").gte("created_at", nyDayRangeUtc(addDays(today, -29)).start.toISOString()),
    supabase.from("leads").select("id", { count: "exact", head: true }).in("stage", ["new", "contacted", "quoted"]),
    supabase.from("leads").select("created_at").eq("stage", "new").is("first_response_at", null).order("created_at"),
    supabase.from("invoices").select("total_cents, amount_paid_cents, due_on").eq("status", "open"),
    supabase.from("goals").select("id, metric, target_value, period_start, period_end").lte("period_start", today).gte("period_end", today),
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .not("account_id", "is", null)
      .gte("accepted_at", nyDayRangeUtc(monthStart).start.toISOString()),
    supabase.from("subcontractors").select("id, display_name, coi_expires_on").eq("status", "active").lte("coi_expires_on", in30).order("coi_expires_on"),
  ]);

  const failed = [jobsRes, lastMonthRes, leadsRes, openLeadsRes, waitingRes, invoicesRes, goalsRes, contractsRes, coiRes].find((r) => r.error);
  if (failed?.error) throw new Error(`Command Center query failed: ${failed.error.message}`);

  const jobs = jobsRes.data ?? [];
  const live = jobs.filter((j) => j.status !== "cancelled");
  const sparkDays = dayRange(sparkStart, today);
  const monthDays = dayRange(monthStart, today);

  // Jobs today
  const todays = jobs.filter((j) => j.scheduled_start >= todayRange.start.toISOString() && j.scheduled_start < todayRange.end.toISOString());
  const todaysLive = todays.filter((j) => j.status !== "cancelled");
  const done = todaysLive.filter((j) => j.status === "completed").length;
  const jobsPerDay = dailySeries(live, (j) => j.scheduled_start, sparkDays);
  const lastWeekSameDay = jobsPerDay[sparkDays.indexOf(addDays(today, -7))] ?? 0;
  const jobsDelta = todaysLive.length - lastWeekSameDay;

  // Revenue this month (completed jobs)
  const completed = jobs.filter((j) => j.status === "completed");
  const revenueSeries = cumulative(dailySeries(completed, (j) => j.scheduled_start, monthDays, (j) => j.price_cents));
  const revenue = revenueSeries.at(-1) ?? 0;
  const lastMonthRevenue = (lastMonthRes.data ?? []).reduce((s, j) => s + j.price_cents, 0);
  const revenuePct = signedPercent(lastMonthRevenue, revenue);

  // Leads
  const leads = leadsRes.data ?? [];
  const newPerDay = dailySeries(leads, (l) => l.created_at, sparkDays);
  const thisWeek = newPerDay.slice(7).reduce((a, b) => a + b, 0);
  const lastWeek = newPerDay.slice(0, 7).reduce((a, b) => a + b, 0);
  const replyMedian = median(leads.filter((l) => l.first_response_at).map((l) => minutesBetween(l.created_at, l.first_response_at as string)));
  const waiting = waitingRes.data ?? [];

  // Money
  const openInvoices = invoicesRes.data ?? [];
  const outstanding = openInvoices.reduce((s, i) => s + ((i.total_cents ?? 0) - i.amount_paid_cents), 0);
  const overdue = openInvoices.filter((i) => i.due_on !== null && i.due_on < today);
  const overdueCents = overdue.reduce((s, i) => s + ((i.total_cents ?? 0) - i.amount_paid_cents), 0);

  // Attention
  const unassigned = live.filter((j) => j.status === "scheduled" && j.scheduled_start >= now.toISOString() && j.job_assignments.length === 0);
  const coi = coiRes.data ?? [];
  const coiExpired = coi.filter((s) => coiTone(s.coi_expires_on, today, in30) === "danger");

  // Goals
  const residentialDone = completed.filter((j) => j.account_id === null && nyDateString(j.scheduled_start) >= monthStart).length;
  const actuals: Partial<Record<GoalMetric, number | null>> = {
    residential_jobs_completed: residentialDone,
    commercial_contracts_signed: contractsRes.count ?? 0,
    jobs_completed: completed.filter((j) => nyDateString(j.scheduled_start) >= monthStart).length,
    revenue_cents: revenue,
    google_reviews: null, // No reviews source connected yet.
  };

  const attention = [
    { key: "leads", show: waiting.length > 0, icon: MessageSquareWarning, href: "/leads", tone: "warning" as const,
      text: `${waiting.length} lead${waiting.length === 1 ? "" : "s"} waiting for a first reply`, meta: waiting[0] ? `oldest ${shortDuration(minutesBetween(waiting[0].created_at, now.toISOString()))}` : "" },
    { key: "unassigned", show: unassigned.length > 0, icon: CalendarX2, href: "/schedule", tone: "warning" as const,
      text: `${unassigned.length} upcoming visit${unassigned.length === 1 ? "" : "s"} without a crew`, meta: "next 7 days" },
    { key: "overdue", show: overdue.length > 0, icon: Receipt, href: "/money", tone: "danger" as const,
      text: `${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`, meta: dollars(overdueCents) },
    { key: "coi", show: coi.length > 0, icon: ShieldAlert, href: "/crews", tone: coiExpired.length ? ("danger" as const) : ("warning" as const),
      text: coiExpired.length ? `${coiExpired.length} insurance certificate${coiExpired.length === 1 ? "" : "s"} expired` : `${coi.length} insurance certificate${coi.length === 1 ? "" : "s"} expiring`,
      meta: coi.map((s) => s.display_name).slice(0, 2).join(", ") },
  ].filter((a) => a.show);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-6">
      <PageHeader title="Command Center" description={formatNyDate(now, "weekday")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Jobs today"
          value={String(todaysLive.length)}
          hint={`${done} done · ${todaysLive.length - done} to go`}
          spark={jobsPerDay}
          delta={{ label: `${signedCount(jobsDelta)} vs last ${formatNyDate(now, "weekday").split(",")[0]}`, direction: direction(jobsDelta), good: jobsDelta >= 0 }}
          href="/schedule"
        />
        <StatTile
          label="Revenue this month"
          value={dollars(revenue)}
          hint="completed jobs"
          spark={revenueSeries}
          delta={revenuePct ? { label: `${revenuePct} vs last month`, direction: direction(revenue - lastMonthRevenue), good: revenue >= lastMonthRevenue } : undefined}
          href="/money"
        />
        <StatTile
          label="Open leads"
          value={String(openLeadsRes.count ?? 0)}
          hint={replyMedian === null ? undefined : `median reply ${shortDuration(replyMedian)}`}
          spark={newPerDay}
          delta={{ label: `${signedCount(thisWeek - lastWeek)} new vs last week`, direction: direction(thisWeek - lastWeek), good: thisWeek >= lastWeek }}
          href="/leads"
        />
        <StatTile
          label="Outstanding"
          value={dollars(outstanding)}
          hint={`${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`}
          delta={overdue.length ? { label: `${dollars(overdueCents)} overdue`, direction: "up", good: false } : undefined}
          href="/money"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <DataTable title="Today's schedule" description={`${todays.length} visit${todays.length === 1 ? "" : "s"}`} storageKey="kc:density:command-center">
            {todays.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing on the schedule today">
                Visits booked for today show up here with their crew and status.
              </EmptyState>
            ) : (
              <Table containerClassName="max-h-[520px]" stackOnMobile>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Crew</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todays.map((j) => {
                    const client = j.account?.name ?? [j.contact?.first_name, j.contact?.last_name].filter(Boolean).join(" ");
                    const crew = j.job_assignments.length
                      ? j.job_assignments.map((a) => a.subcontractor?.display_name).filter(Boolean).join(", ")
                      : j.crew?.name ?? "Unassigned";
                    return (
                      <TableRow key={j.id}>
                        <TableCell label="Time" className="tabular">
                          {formatNyTime(j.scheduled_start)}–{formatNyTime(j.scheduled_end)}
                        </TableCell>
                        <TableCell label="Client" className="max-w-[220px] max-md:max-w-none">
                          {/* One wrapper so the stacked phone layout keeps name and borough together. */}
                          <div className="min-w-0 max-md:text-right">
                            <div className="truncate font-medium text-ink">{client}</div>
                            <div className="truncate text-[12px] text-ink-muted capitalize">{j.property?.borough?.replace("_", " ")}</div>
                          </div>
                        </TableCell>
                        <TableCell label="Crew" className="max-w-[200px] truncate max-md:max-w-none">
                          {crew === "Unassigned" ? <span className="text-warning">Unassigned</span> : crew}
                        </TableCell>
                        <TableCell label="Status">
                          <StatusPill tone={jobTone(j.status)}>{jobLabel[j.status]}</StatusPill>
                        </TableCell>
                        <TableCell label="Price" className="text-right font-medium tabular">
                          {formatCents(j.price_cents)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </DataTable>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="attention" className="rounded-lg bg-sand p-4">
            <h2 id="attention" className="font-heading text-xl font-semibold text-ink">Needs attention</h2>
            {attention.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                <CheckCircle2 className="size-4 text-success" aria-hidden /> All clear.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {attention.map((a) => {
                  const Icon = a.icon;
                  return (
                    <li key={a.key}>
                      <Link
                        href={a.href}
                        className="group flex items-center gap-3 rounded-sm bg-surface px-3 py-2.5 shadow-e1 transition-colors duration-fast hover:bg-surface-raised"
                      >
                        <span className={a.tone === "danger" ? "text-danger" : "text-warning"}>
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink">{a.text}</span>
                          {a.meta && <span className="block truncate text-[12px] text-ink-muted">{a.meta}</span>}
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-ink-muted transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="goals" className="rounded-md border border-border bg-surface p-4">
            <h2 id="goals" className="font-heading text-xl font-semibold text-ink">Goals this month</h2>
            {(goalsRes.data ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No goals set for this month.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {(goalsRes.data ?? []).map((g) => {
                  const actual = actuals[g.metric];
                  const pct = actual === null || actual === undefined || g.target_value === 0 ? 0 : Math.min(100, Math.round((actual / g.target_value) * 100));
                  const fmt = (n: number) => (g.metric === "revenue_cents" ? dollars(n) : String(n));
                  return (
                    <li key={g.id}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-ink">{GOAL_LABELS[g.metric]}</span>
                        <span className="text-ink-muted tabular">
                          {actual === null || actual === undefined ? "Not connected" : `${fmt(actual)} of ${fmt(g.target_value)}`}
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={GOAL_LABELS[g.metric]}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised"
                      >
                        <div className={pct >= 100 ? "h-full rounded-full bg-success-fill" : "h-full rounded-full bg-brand"} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
