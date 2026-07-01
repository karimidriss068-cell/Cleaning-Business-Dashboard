import { cn } from "@/lib/utils";

type Tone = "good" | "active" | "warn" | "bad" | "muted";

const STATUS_TONE: Record<string, Tone> = {
  // accounts
  active: "good",
  paused: "muted",
  churned: "bad",
  // campaigns
  draft: "muted",
  ended: "muted",
  // creatives
  testing: "active",
  winning: "good",
  retired: "muted",
  // leads
  new: "active",
  contacted: "active",
  qualified: "warn",
  booked: "good",
  dead: "bad",
  // appointments
  showed: "good",
  no_show: "bad",
  cancelled: "bad",
  closed: "good",
};

const TONE_CLASS: Record<Tone, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  active: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  warn: "border-primary/40 bg-primary/10 text-primary",
  bad: "border-red-500/30 bg-red-500/10 text-red-400",
  muted: "border-border bg-secondary text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        TONE_CLASS[tone],
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
