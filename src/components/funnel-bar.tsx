import { cn } from "@/lib/utils";
import { FUNNEL_STAGES, STAGE_LABELS, type Funnel } from "@/lib/outreach";

/**
 * Compact 5-bar funnel: each stage's height is its share of everyone contacted,
 * so you can see WHERE a script leaks, not just its final number. The closed
 * stage is crimson (the outcome that matters); the rest are muted cream.
 */
export function FunnelBar({ funnel }: { funnel: Funnel }) {
  const rates = [
    1,
    funnel.replyRate,
    funnel.callBookedRate,
    funnel.callHeldRate,
    funnel.closeRate,
  ];
  const counts = [
    funnel.contacted,
    funnel.replied,
    funnel.call_booked,
    funnel.call_held,
    funnel.closed,
  ];

  return (
    <div className="flex h-8 w-32 items-end gap-1">
      {FUNNEL_STAGES.map((stage, i) => (
        <div
          key={stage}
          className="flex h-full flex-1 items-end"
          title={`${STAGE_LABELS[stage]}: ${counts[i]}`}
        >
          <div
            className={cn(
              "w-full rounded-sm",
              i === FUNNEL_STAGES.length - 1
                ? "bg-[var(--accent-primary)]"
                : "bg-[color-mix(in_srgb,var(--text-muted)_45%,transparent)]",
            )}
            style={{ height: `${Math.max(rates[i] * 100, 5)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
