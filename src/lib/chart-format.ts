import { formatCents } from "@/lib/format";

/** How a chart's values read. A name, not a function, so server pages can pass it to client charts. */
export type ChartFormat = "dollars-short" | "dollars" | "count";

/** Values are integer cents for the dollar formats. $0, $850, $1.2k for the short one. */
export function formatChartValue(v: number, format: ChartFormat): string {
  if (format === "dollars-short") return v >= 100000 ? `$${(v / 100000).toFixed(1)}k` : `$${Math.round(v / 100)}`;
  if (format === "dollars") return formatCents(Math.round(v / 100) * 100, { hideZeroCents: true });
  return Math.round(v).toLocaleString("en-US");
}
