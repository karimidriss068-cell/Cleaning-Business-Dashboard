import { CardShell } from "./card-shell";
import { HeroNumber } from "./hero-number";

/**
 * A sequence of funnel stages (Leads → Contacted → ... → Closed), each a
 * small glass card with a count-up number and the conversion rate off the
 * previous stage. Used by campaign and outreach detail pages alike.
 */
export function FunnelRow({
  stages,
}: {
  stages: { label: string; value: number }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
      {stages.map((stage, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const rate = prev && prev > 0 ? Math.round((stage.value / prev) * 100) : null;
        return (
          <CardShell key={stage.label} className="px-4 py-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {stage.label}
            </p>
            <div className="relative z-10 mt-2">
              <HeroNumber
                value={stage.value}
                format="num"
                size="sm"
                accent={i === 0 ? "crimson" : "muted"}
              />
            </div>
            {rate !== null && (
              <p className="relative z-10 mt-1.5 text-[11px] text-muted-foreground">
                {rate}% of prev
              </p>
            )}
          </CardShell>
        );
      })}
    </div>
  );
}
