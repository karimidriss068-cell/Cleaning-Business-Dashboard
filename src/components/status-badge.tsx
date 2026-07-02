import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "muted";

// Restraint: sage (good) is reserved for showed/closed; crimson (bad) only for
// genuine negatives; amber (warn) for at-risk; cream-tan (muted) for the rest.
const STATUS_TONE: Record<string, Tone> = {
  // positive completion
  showed: "good",
  closed: "good",
  // negatives
  dead: "bad",
  no_show: "bad",
  cancelled: "bad",
  churned: "bad",
  // alert types
  cpa_critical: "bad",
  cpa_warning: "warn",
  zero_leads: "warn",
  other: "muted",
  // neutral / in-progress fall through to muted.
};

const TONE_CLASS: Record<Tone, string> = {
  good: "badge-good",
  warn: "badge-warn",
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
