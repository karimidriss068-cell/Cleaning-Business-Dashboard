import type { Metadata } from "next";
import { CalendarCheck, UserX } from "lucide-react";
import { getMember } from "@/lib/member";
import { loadCrewHome } from "@/lib/crew-data";
import { groupVisits, insuranceReminder } from "@/lib/crew";
import { formatCents, formatNyDate, nyToday, nyWallClock, nyWallTimeToUtc } from "@/lib/format";
import { EmptyState } from "@/components/system/empty-state";
import { InsuranceBanner } from "@/components/crew/insurance-banner";
import { VisitCard } from "@/components/crew/visit-card";

export const metadata: Metadata = { title: "My jobs" };
export const dynamic = "force-dynamic";

function greeting(now: Date) {
  const hour = Number(nyWallClock(now).time.slice(0, 2));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function MyJobsPage() {
  const { profile, supabase } = await getMember();
  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="rounded-lg border glass-solid shadow-e1">
          <EmptyState icon={UserX} title="Your login isn't on the team yet">Ask the office to set you up.</EmptyState>
        </div>
      </div>
    );
  }

  const now = new Date();
  const today = nyToday(now);
  const { me, visits } = await loadCrewHome(supabase);
  const { today: todays, upcoming } = groupVisits(visits, today);
  const reminder = insuranceReminder(me.coiExpiresOn, today);
  const firstName = me.displayName.split(" ")[0] || profile.fullName.split(" ")[0];
  const pay = todays.reduce((sum, v) => sum + (v.my_pay_cents ?? 0), 0);
  const payUnknown = todays.some((v) => v.my_pay_cents === null);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-6">
      <header className="kc-enter">
        <p className="text-[13px] font-semibold tracking-[0.14em] text-crew-muted uppercase">{formatNyDate(now, "weekday")}</p>
        <h1 className="mt-1 font-heading text-[34px] leading-10 font-semibold tracking-[-0.01em] text-ink">
          {greeting(now)}, {firstName}
        </h1>
        <p className="mt-1 text-[17px] text-crew-muted tabular">
          {todays.length === 0 ? "Nothing scheduled today." : `${todays.length} visit${todays.length === 1 ? "" : "s"} today · ${formatCents(pay)}${payUnknown ? "+" : ""} pay`}
        </p>
      </header>

      {reminder && <InsuranceBanner reminder={reminder} />}

      <section aria-label="Today" className="space-y-4">
        <h2 className="sr-only">Today</h2>
        {todays.length === 0 ? (
          <div className="rounded-lg border glass-solid shadow-e1 [&_p]:text-crew-muted">
            <EmptyState icon={CalendarCheck} title="No visits today">Enjoy the day off. Your next visits are below.</EmptyState>
          </div>
        ) : (
          todays.map((v, i) => <VisitCard key={v.job_id} visit={v} index={i + 1} />)
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-label="Upcoming" className="space-y-6">
          <h2 className="font-heading text-2xl font-medium text-ink">Coming up</h2>
          {upcoming.map((day) => (
            <div key={day.date} className="space-y-3">
              <h3 className="text-[17px] font-semibold text-crew-muted tabular">{formatNyDate(nyWallTimeToUtc(day.date, "12:00"), "weekday")}</h3>
              {day.visits.map((v) => (
                <VisitCard key={v.job_id} visit={v} compact />
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
