import { cn } from "@/lib/utils";

/**
 * A "hero number" — the visual signature of MAKI Ops. Small-caps label above a
 * large Fraunces numeral, underlined with a thin crimson accent under the digits
 * themselves. `hero` bumps the size and brightens the underline for the single
 * most important metric on a view (CPA, revenue owed, margin).
 */
export function Stat({
  label,
  value,
  sub,
  hero = false,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card px-4 py-4",
        className,
      )}
    >
      <p className="kpi-label">{label}</p>
      <div className="mt-2.5 leading-none">
        <span
          className={cn(
            "kpi-number",
            hero ? "text-[2.75rem] sm:text-[3.25rem]" : "text-[1.75rem]",
            !hero && "kpi-number--muted",
          )}
        >
          {value}
        </span>
      </div>
      {sub && <p className="mt-2.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
