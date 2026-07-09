import { cn } from "@/lib/utils";
import { CardShell } from "./card-shell";
import { HeroNumber } from "./hero-number";

/**
 * Single-value KPI card — the workhorse stat across every non-dashboard
 * page (account/campaign/script detail, reports). Same glass panel, hover
 * lift, and count-up as the dashboard; no split, no glow (that's reserved
 * for HeroStatCard, the one dominant number per page).
 */
export function StatCard({
  label,
  value,
  format,
  sub,
  size = "md",
  accent = "crimson",
  className,
}: {
  label: string;
  value: string | number;
  format?: "money" | "num" | "pct" | "duration";
  sub?: string;
  size?: "sm" | "md" | "lg";
  accent?: "crimson" | "muted";
  className?: string;
}) {
  return (
    <CardShell className={cn("px-6 py-6", className)}>
      <p className="kpi-label relative z-10">{label}</p>
      <div className="relative z-10 mt-3">
        <HeroNumber value={value} format={format} size={size} accent={accent} />
      </div>
      {sub && <p className="relative z-10 mt-3 text-xs text-muted-foreground">{sub}</p>}
    </CardShell>
  );
}
