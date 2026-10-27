import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarX2, UserX } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addDays, nyDateString, nyToday } from "@/lib/format";
import { loadRange, loadUnassigned } from "@/lib/schedule-data";
import { weekOf } from "@/lib/schedule-lanes";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { BoardToolbar } from "@/components/schedule/board-toolbar";
import { ScheduleClient } from "@/components/schedule/schedule-client";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  view: z.enum(["crew", "person"]).optional().catch(undefined),
  range: z.enum(["day", "week"]).optional().catch(undefined),
});

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
        <div className="rounded-md border border-hairline bg-surface surface-layer shadow-e1">
          <EmptyState icon={UserX} title="Your login isn't on the team yet">Ask the owner to add you.</EmptyState>
        </div>
      </div>
    );
  }

  const raw = paramsSchema.parse(await searchParams);
  const now = new Date();
  const today = nyToday(now);
  const date = raw.date && !Number.isNaN(Date.parse(`${raw.date}T00:00:00Z`)) ? raw.date : today;
  const mode = raw.view ?? "crew";
  const range = raw.range ?? "day";
  const days = range === "week" ? weekOf(date) : [date];

  // Load the board's range plus the tray's window (today + 6 days), so conflict
  // checks see every day a visit could land on; lanes only show the board's range.
  const loadFrom = days[0] < today ? days[0] : today;
  const trayEnd = addDays(today, 6);
  const loadTo = days[days.length - 1] > trayEnd ? days[days.length - 1] : trayEnd;
  const [{ visits: pool, crews, roster, crewMembers }, tray] = await Promise.all([loadRange(supabase, loadFrom, loadTo), loadUnassigned(supabase, today)]);
  const visits = pool.filter((v) => {
    const d = nyDateString(v.start);
    return d >= days[0] && d <= days[days.length - 1];
  });
  // Remount the interactive board only when the server data really changed.
  const dataKey = [...pool, ...tray].reduce((h, v) => (h * 31 + [...`${v.id}${v.updatedAt}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) | 0, 7).toString(36);
  const live = visits.filter((v) => v.status !== "cancelled");
  const unassigned = live.filter((v) => v.people.length === 0 && v.status === "scheduled").length;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Dispatch"
        title="Schedule"
        description={`${live.length} visit${live.length === 1 ? "" : "s"} ${range === "week" ? "this week" : "today"} · ${live.filter((v) => v.status === "completed").length} done · ${unassigned} without a cleaner`}
      />
      <BoardToolbar date={date} today={today} mode={mode} range={range} />
      {visits.length === 0 && tray.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface surface-layer shadow-e1">
          <EmptyState icon={CalendarX2} title={range === "week" ? "No visits this week" : "No visits this day"}>Visits booked for this period, including recurring ones, appear here.</EmptyState>
        </div>
      ) : (
        <ScheduleClient
          key={`${date}:${mode}:${range}:${dataKey}`}
          date={date}
          mode={mode}
          range={range}
          days={days}
          today={today}
          now={range === "day" && date === today ? now.toISOString() : null}
          initialVisits={pool}
          initialTray={tray}
          crews={crews}
          roster={roster}
          crewMembers={crewMembers}
          isAdmin={profile.role === "owner" || profile.role === "admin"}
        />
      )}
    </div>
  );
}
