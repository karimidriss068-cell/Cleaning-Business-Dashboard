"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { completeState } from "@/lib/crew";
import { formatNyDate, formatNyTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { completeVisit } from "@/app/actions/crew";
import { Button } from "@/components/ui/button";

/**
 * The Complete button. Allowed from one hour before the start (the same rule
 * complete_job enforces); before that it explains when it opens instead of
 * failing. If the office's clock disagrees, the server's refusal is shown the
 * same way.
 */
export function CompletePanel({ jobId, start, status, completedAt, tasksLeft }: { jobId: string; start: string; status: string; completedAt: string | null; tasksLeft: number }) {
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [serverEarly, setServerEarly] = useState(false);
  const state = now ? completeState(now, start, status) : null;

  if (status === "completed" || state?.kind === "done") {
    return (
      <div role="status" className="flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-[17px] text-success">
        <CheckCircle2 className="size-6 shrink-0" aria-hidden />
        <span>Completed{completedAt ? ` at ${formatNyTime(completedAt)}, ${formatNyDate(completedAt, "weekday")}` : ""}. Nice work.</span>
      </div>
    );
  }
  if (state?.kind === "closed") {
    return <p className="rounded-lg border border-hairline bg-surface-raised p-4 text-[17px] text-crew-muted">This visit is closed and can&apos;t be completed.</p>;
  }

  const early = state?.kind === "too_early" || serverEarly;
  const opensLabel = state?.kind === "too_early" ? state.label : null;

  async function run() {
    setBusy(true);
    const result = await completeVisit({ jobId });
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      toast.success("Visit completed", { description: "Thanks! The office has been updated." });
      router.refresh();
    } else if (result.code === "too_early") setServerEarly(true);
    else toast.error("Couldn't complete the visit", { description: result.message });
  }

  function onTap() {
    if (early) {
      toast.error("Too early to complete", { description: opensLabel ? `You can complete this visit from ${opensLabel}.` : "You can complete a visit from one hour before it starts." });
      return;
    }
    if (tasksLeft > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    void run();
  }

  // Pinned above the tab bar only while there's something to act on; the
  // explanation when it's too early scrolls with the page instead of covering it.
  const pinned = !early && !!state;
  return (
    <div className={cn("space-y-3", pinned && "sticky bottom-[calc(64px+env(safe-area-inset-bottom)+0.75rem)] z-10 rounded-lg border border-hairline glass p-3 shadow-e2 md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none")}>
      {early && (
        <p role="status" className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-[17px] text-warning">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">Too early to complete.</strong> {opensLabel ? `You can complete this visit from ${opensLabel}, one hour before it starts.` : "You can complete a visit from one hour before it starts."}
          </span>
        </p>
      )}
      {confirming && (
        <p role="alert" className="rounded-lg border border-hairline bg-surface-raised p-4 text-[17px] text-ink">
          {tasksLeft} task{tasksLeft === 1 ? " isn't" : "s aren't"} ticked. Complete anyway?
        </p>
      )}
      <Button type="button" size="crew" onClick={onTap} loading={busy} aria-disabled={early || !state} className={early || !state ? "opacity-60" : undefined}>
        {!state ? "Checking the time…" : early ? (opensLabel ? `Opens at ${opensLabel}` : "Not yet") : confirming ? "Yes, complete visit" : "Mark visit complete"}
      </Button>
      {confirming && (
        <Button type="button" variant="secondary" size="crew" onClick={() => setConfirming(false)}>
          Keep working
        </Button>
      )}
    </div>
  );
}
