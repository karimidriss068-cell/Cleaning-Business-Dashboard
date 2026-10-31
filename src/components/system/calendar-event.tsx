import { cn } from "@/lib/utils";
import { formatNyTime } from "@/lib/format";
import { jobLabel, jobTone, type JobStatus, type Tone } from "@/lib/status";

const toneClass: Record<Tone, string> = {
  info: "bg-info-soft/90 border-brand",
  success: "bg-success-soft border-success",
  warning: "bg-warning-soft border-warning-fill",
  danger: "bg-danger-soft border-danger",
  neutral: "bg-surface-raised border-border-input",
  secondary: "bg-surface-raised border-accent2",
};

/**
 * A job on the schedule. Height comes from the caller (duration), min 32px.
 * Pass the pixel height so the content fits instead of clipping: under 48px
 * it's one line, under 64px two, otherwise time, client and crew.
 */
export function CalendarEvent({
  start,
  end,
  client,
  crew,
  status,
  height,
  className,
  style,
}: {
  start: string | Date;
  end: string | Date;
  client: string;
  crew?: string;
  status: JobStatus;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const lines = height === undefined ? 3 : height < 48 ? 1 : height < 64 ? 2 : 3;
  const time = `${formatNyTime(start)}–${formatNyTime(end)}`;
  if (lines === 1) {
    return (
      <div
        style={style}
        title={`${time} ${client}, ${jobLabel[status]}`}
        className={cn(
          "kc-settle",
          "flex min-h-8 items-center gap-1.5 overflow-hidden rounded-sm border-l-2 px-2.5 text-xs shadow-e1 backdrop-blur-sm",
          toneClass[jobTone(status)],
          status === "cancelled" && "line-through decoration-ink-muted",
          className,
        )}
      >
        <span className="shrink-0 font-medium text-ink tabular">{formatNyTime(start)}</span>
        <span className="truncate text-ink">{client}</span>
        <span className="sr-only">{jobLabel[status]}</span>
      </div>
    );
  }
  return (
    <div
      style={style}
      title={`${client}, ${jobLabel[status]}`}
      className={cn(
          "kc-settle",
        "flex min-h-8 flex-col overflow-hidden rounded-sm border-l-2 px-2.5 py-1.5 text-xs leading-4 shadow-e1 backdrop-blur-sm",
        toneClass[jobTone(status)],
        status === "cancelled" && "line-through decoration-ink-muted",
        className,
      )}
    >
      <span className="truncate font-medium text-ink tabular">{time}</span>
      <span className="truncate font-medium text-ink">{client}</span>
      {crew && lines === 3 && <span className="truncate text-ink-muted">{crew}</span>}
      <span className="sr-only">{jobLabel[status]}</span>
    </div>
  );
}

/** The current time across a day column: accent hairline with a glowing dot. */
export function CalendarNowLine({ top, label }: { top: number; label: string }) {
  return (
    <div aria-label={`Now, ${label}`} role="img" className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top }}>
      <span className="size-2 -translate-x-1 rounded-full bg-brand shadow-[0_0_0_3px_var(--kc-glow),0_0_12px_var(--kc-glow)]" />
      <span className="h-px flex-1 bg-brand/80 shadow-[0_0_8px_var(--kc-glow)]" />
    </div>
  );
}
