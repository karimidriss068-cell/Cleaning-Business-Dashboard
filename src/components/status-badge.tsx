import { cn } from "@/lib/utils";

type Tone = "good" | "bad" | "muted";

// Restraint: sage (good) is reserved for showed/closed; crimson (bad) only for
// genuine negatives; cream-tan (muted) carries everything else.
const STATUS_TONE: Record<string, Tone> = {
  // positive completion
  showed: "good",
  closed: "good",
  // negatives
  dead: "bad",
  no_show: "bad",
  cancelled: "bad",
  churned: "bad",
  // neutral / in-progress — active, paused, draft, ended, testing, winning,
  // retired, new, contacted, qualified, booked all fall through to muted.
};

const TONE_CLASS: Record<Tone, string> = {
  good: "badge-good",
  bad: "badge-bad",
  muted: "badge-muted",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return (
    <span className={cn("badge", TONE_CLASS[tone])}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
