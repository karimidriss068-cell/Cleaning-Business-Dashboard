import { CardShell } from "./card-shell";
import { GlowBlob, GlowUnderline } from "./glow";
import { HeroNumber } from "./hero-number";
import { Sparkline } from "./sparkline";
import { money } from "@/lib/format";

/**
 * The one dominant editorial number on the page — cream accent, mega size,
 * reserved for the single most important metric (cost per appointment).
 * MAKI vs. Client breakdown demotes to a supporting annotation underneath
 * rather than fighting the blended figure for visual weight.
 */
export function DominantStat({
  label,
  value,
  sub,
  internal,
  client,
  sparklineData,
}: {
  label: string;
  value: number | null;
  sub: string;
  internal: number | null;
  client: number | null;
  sparklineData?: { date: string; value: number }[];
}) {
  return (
    <CardShell className="overflow-hidden px-8 py-10 sm:px-12 sm:py-12">
      <div className="relative">
        <GlowBlob accent="cream" />
        <p className="kpi-label relative z-10">{label}</p>
        <div className="relative z-10 mt-4">
          <HeroNumber
            value={value ?? "—"}
            format={value !== null ? "money" : undefined}
            size="mega"
            accent="cream"
          />
        </div>
        <GlowUnderline accent="cream" className="relative z-10 mt-4 h-[3px] w-40" />
        <p className="relative z-10 mt-5 text-sm text-muted-foreground">{sub}</p>
        <div className="relative z-10 mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            MAKI{" "}
            <span className="font-data tabular-nums text-[var(--text-primary)]">
              {internal !== null ? money(internal) : "—"}
            </span>
          </span>
          <span className="text-muted-foreground">
            Clients{" "}
            <span className="font-data tabular-nums text-[var(--text-primary)]">
              {client !== null ? money(client) : "—"}
            </span>
          </span>
        </div>
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
