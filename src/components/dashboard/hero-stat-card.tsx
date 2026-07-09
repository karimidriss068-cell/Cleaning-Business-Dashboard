import { cn } from "@/lib/utils";
import { CardShell } from "./card-shell";
import { GlowBlob, GlowUnderline } from "./glow";
import { HeroNumber } from "./hero-number";
import { Sparkline } from "./sparkline";

/**
 * The one dominant editorial number on a page — cream accent, mega size,
 * breathing glow, optional sparkline. Reserved for the single most
 * important metric on a view (e.g. CPA, revenue owed, reply rate).
 */
export function HeroStatCard({
  label,
  value,
  format,
  sub,
  sparklineData,
  className,
}: {
  label: string;
  value: number | string | null;
  format?: "money" | "num" | "pct" | "duration";
  sub?: string;
  sparklineData?: { date: string; value: number }[];
  className?: string;
}) {
  return (
    <CardShell className={cn("overflow-hidden px-8 py-10 sm:px-10 sm:py-11", className)}>
      <div className="relative">
        <GlowBlob accent="cream" />
        <p className="kpi-label relative z-10">{label}</p>
        <div className="relative z-10 mt-4">
          <HeroNumber
            value={value ?? "—"}
            format={value !== null ? format : undefined}
            size="mega"
            accent="cream"
          />
        </div>
        <GlowUnderline accent="cream" className="relative z-10 mt-4 h-[3px] w-40" />
        {sub && <p className="relative z-10 mt-5 text-sm text-muted-foreground">{sub}</p>}
      </div>

      {sparklineData && sparklineData.length > 1 && (
        <div className="relative z-0 -mx-2 mt-8 opacity-70">
          <Sparkline
            data={sparklineData}
            dataKey="value"
            color="var(--accent-cream-rich)"
            height={64}
          />
        </div>
      )}
    </CardShell>
  );
}
