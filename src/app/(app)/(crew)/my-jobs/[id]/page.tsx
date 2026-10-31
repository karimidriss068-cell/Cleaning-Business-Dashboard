import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { getMember } from "@/lib/member";
import { loadCrewVisit } from "@/lib/crew-data";
import { addressLine, mapsUrl, payLabel } from "@/lib/crew";
import { formatNyDate, formatNyTime } from "@/lib/format";
import { jobLabel, jobTone } from "@/lib/status";
import { StatusPill } from "@/components/system/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Checklist } from "@/components/crew/checklist";
import { CompletePanel } from "@/components/crew/complete-panel";
import { PhotoSection } from "@/components/crew/photo-section";
import { VisitNote } from "@/components/crew/visit-note";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visit" };
export const dynamic = "force-dynamic";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-lg border glass-solid shadow-e1 p-5 shadow-e1">
    <h2 className="font-heading text-xl font-medium text-ink">{title}</h2>
    {children}
  </section>
);

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase } = await getMember();
  const page = await loadCrewVisit(supabase, id);
  if (!page) notFound();
  const { visit: v, photos } = page;
  const open = v.status === "scheduled" || v.status === "in_progress";
  const tasksLeft = v.checklist.filter((c) => !c.done_at).length;

  return (
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 pt-4 pb-6">
      <Link href="/my-jobs" className="flex min-h-12 w-fit items-center gap-2 text-[17px] text-ink underline underline-offset-4">
        <ArrowLeft className="size-5" aria-hidden /> My jobs
      </Link>

      <header className="kc-enter space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-heading text-[32px] leading-9 font-semibold tracking-[-0.01em] text-ink tabular">
            {formatNyTime(v.scheduled_start)}
            <span className="text-[20px] text-crew-muted"> – {formatNyTime(v.scheduled_end)}</span>
          </h1>
          <StatusPill tone={jobTone(v.status)}>{jobLabel[v.status]}</StatusPill>
        </div>
        <p className="text-[15px] text-crew-muted">{formatNyDate(v.scheduled_start, "weekday")}</p>
        <p className="pt-1 text-[20px] font-medium text-ink">{v.service_name}</p>
        <p className="text-[17px] text-crew-muted">{v.client_name}</p>
      </header>

      <Section title="Where">
        <p className="text-[17px] text-ink">{addressLine(v)}</p>
        <a href={mapsUrl(v)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "secondary", size: "crew" }))}>
          <MapPin /> Open in Maps
        </a>
        {v.access_instructions && (
          <p className="rounded-md bg-highlight p-3 text-[17px] text-ink">
            <span className="block text-[13px] font-semibold tracking-[0.1em] text-crew-muted uppercase">Access</span>
            {v.access_instructions}
          </p>
        )}
        {v.crew_notes && (
          <p className="text-[17px] text-ink">
            <span className="block text-[13px] font-semibold tracking-[0.1em] text-crew-muted uppercase">From the office</span>
            {v.crew_notes}
          </p>
        )}
        {v.teammates.length > 0 && (
          <p className="flex items-center gap-2 text-[17px] text-crew-muted">
            <Users className="size-5" aria-hidden /> With {v.teammates.join(", ")}
          </p>
        )}
        <p className="flex items-baseline justify-between border-t border-hairline pt-3 text-[17px]">
          <span className="text-crew-muted">Your pay</span>
          <span className="font-heading text-2xl font-medium text-ink tabular">{payLabel(v.my_pay_cents, v.my_pay_cents === null)}</span>
        </p>
      </Section>

      <Section title="Checklist">
        <Checklist items={v.checklist.map((c) => ({ id: c.id, label: c.label, done: c.done_at !== null }))} editable={open} />
      </Section>

      <Section title="Photos">
        <PhotoSection jobId={v.job_id} kind="before" title="Before" photos={photos.filter((p) => p.kind === "before")} canUpload={open} />
        <div className="border-t border-hairline pt-4">
          <PhotoSection jobId={v.job_id} kind="after" title="After" photos={photos.filter((p) => p.kind === "after")} canUpload={open} />
        </div>
      </Section>

      <Section title="Your notes">
        <VisitNote jobId={v.job_id} initial={v.note} editable={open} />
      </Section>

      <CompletePanel jobId={v.job_id} start={v.scheduled_start} status={v.status} completedAt={v.completed_at} tasksLeft={tasksLeft} />
    </div>
  );
}
