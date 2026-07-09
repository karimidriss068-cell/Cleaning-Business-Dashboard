"use client";

import { cn } from "@/lib/utils";
import { KpiNumber } from "@/components/kpi-number";

/**
 * A "hero number" card — the visual signature of MAKI Ops. Small-caps label
 * above a large Fraunces numeral. `hero` bumps the size and gives the
 * underline a breathing glow for the single most important metric on a view
 * (CPA, revenue owed, margin).
 *
 * Pass a raw `value` (number) + `format` ("money" | "num") to count up on
 * mount; pass a pre-formatted string for static display (e.g. "—" placeholders).
 * `format` is a key rather than a function since Stat is a Client Component
 * and functions can't cross the server/client boundary as props.
 */
export function Stat({
  label,
  value,
  format,
  sub,
  hero = false,
  className,
  style,
}: {
  label: string;
  value: string | number;
  format?: "money" | "num";
  sub?: string;
  hero?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("panel px-5 py-5 animate-fade-up", className)} style={style}>
      <p className="kpi-label relative z-10">{label}</p>
      <div className="mt-3 leading-none">
        <KpiNumber value={value} format={format} hero={hero} muted={!hero} />
      </div>
      {sub && <p className="mt-3 text-xs text-muted-foreground relative z-10">{sub}</p>}
    </div>
  );
}
