import { CardShell } from "./card-shell";
import { HeroNumber } from "./hero-number";
import { GlowUnderline } from "./glow";

/**
 * Smaller supporting KPI card — MAKI vs. Client, split by a thin vertical
 * hairline. Deliberately quieter than DominantStat (no glow, no gold) so the
 * page has one clear focal point instead of five equal-weight numbers.
 */
export function SupportingStat({
  label,
  internal,
  client,
  format,
}: {
  label: string;
  internal: string | number;
  client: string | number;
  format?: "money" | "num" | "pct" | "duration";
}) {
  return (
    <CardShell className="px-6 py-6">
      <p className="kpi-label relative z-10">{label}</p>
      <div className="relative z-10 mt-4 flex items-stretch gap-5">
        <div className="flex-1">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            MAKI
          </p>
          <HeroNumber value={internal} format={format} size="md" accent="crimson" />
          <GlowUnderline accent="muted" className="relative mt-2.5 h-[2px] w-10" />
        </div>
        <div className="divider-warm--v shrink-0" />
        <div className="flex-1">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Clients
          </p>
          <HeroNumber value={client} format={format} size="md" accent="muted" />
          <GlowUnderline accent="muted" className="relative mt-2.5 h-[2px] w-10" />
        </div>
      </div>
    </CardShell>
  );
}
