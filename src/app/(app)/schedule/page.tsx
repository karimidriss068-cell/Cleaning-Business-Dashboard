import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarX2, UserX } from "lucide-react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { nyToday } from "@/lib/format";
import { loadRange } from "@/lib/schedule-data";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { BoardToolbar } from "@/components/schedule/board-toolbar";
import { ScheduleClient } from "@/components/schedule/schedule-client";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  view: z.enum(["crew", "person"]).optional().catch(undefined),
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

  const { visits, crews, roster, crewMembers } = await loadRange(supabase, date, date);
  // Remount the interactive board only when the server data really changed.
  const dataKey = visits.reduce((h, v) => (h * 31 + [...`${v.id}${v.updatedAt}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) | 0, 7).toString(36);
  const live = visits.filter((v) => v.status !== "cancelled");
  const unassigned = live.filter((v) => v.people.length === 0 && v.status === "scheduled").length;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-6 md:px-6">
      <PageHeader
        eyebrow="Dispatch"
        title="Schedule"
        description={`${live.length} visit${live.length === 1 ? "" : "s"} · ${live.filter((v) => v.status === "completed").length} done · ${unassigned} without a cleaner`}
      />
      <BoardToolbar date={date} today={today} mode={mode} />
      {visits.length === 0 ? (
        <div className="rounded-md border border-hairline bg-surface surface-layer shadow-e1">
          <EmptyState icon={CalendarX2} title="No visits this day">Visits booked for this day, including recurring ones, appear here.</EmptyState>
        </div>
      ) : (
        <ScheduleClient
          key={`${date}:${mode}:${dataKey}`}
          date={date}
          mode={mode}
          now={date === today ? now.toISOString() : null}
          initialVisits={visits}
          crews={crews}
          roster={roster}
          crewMembers={crewMembers}
          isAdmin={profile.role === "owner" || profile.role === "admin"}
        />
      )}
    </div>
  );
}
