import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/format";
import { leadLabel, leadTone, type LeadStage, type Tone } from "@/lib/status";

const stripe: Record<Tone, string> = {
  info: "bg-brand",
  sand: "bg-chart-3",
  success: "bg-success-fill",
  neutral: "bg-border-input",
  warning: "bg-warning-fill",
  danger: "bg-danger-fill",
};

/** Lead card for the pipeline board (DESIGN.md section 10). */
export function KanbanCard({
  name,
  service,
  valueCents,
  age,
  source,
  stage,
  className,
}: {
  name: string;
  service: string;
  valueCents: number | null;
  age: string;
  source: string;
  stage: LeadStage;
  className?: string;
}) {
  return (
    <article
      aria-label={`${name}, ${leadLabel[stage]}`}
      className={cn(
        "group relative rounded-md border border-border bg-surface py-3 pr-3 pl-4 shadow-e1 dark:bg-surface-raised transition-colors duration-fast hover:border-border-input",
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-2 left-1.5 w-[3px] rounded-xs", stripe[leadTone(stage)])} />
      <div className="flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-medium text-ink">{name}</h4>
        <GripVertical aria-hidden className="size-4 shrink-0 text-ink-muted opacity-0 transition-opacity duration-fast group-hover:opacity-100" />
      </div>
      <p className="truncate text-[13px] text-ink-muted">{service}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
        <span className="font-medium text-ink tabular">{valueCents === null ? "—" : formatCents(valueCents, { hideZeroCents: true })}</span>
        <span className="truncate text-ink-muted">
          {source} · {age}
        </span>
      </div>
    </article>
  );
}
