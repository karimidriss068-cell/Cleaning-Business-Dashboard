"use client";

import { StatTile, type Delta } from "@/components/system/stat-tile";
import { formatCalendarDate } from "@/lib/format";
import { useReplay } from "./replay";

type Metric = "monthToDate" | "visits" | "newLeads";
type Figure = { value: number; kind: "cents" | "count"; hideZeroCents?: boolean };

const short = (date: string) => formatCalendarDate(date).replace(/, \d{4}$/, "");

/**
 * A KPI tile that shows today's figure, and while someone scrubs the replay
 * shows that day's figure instead (with the line drawn only up to the playhead
 * and no delta, since "versus last week" isn't known for a past day).
 */
export function ReplayStatTile({
  metric,
  label,
  figure,
  hint,
  spark,
  delta,
  href,
  index,
}: {
  metric: Metric;
  label: string;
  figure: Figure;
  hint?: string;
  spark?: number[];
  delta?: Delta;
  href?: string;
  index?: number;
}) {
  const r = useReplay();
  if (!r || r.live) return <StatTile label={label} figure={figure} hint={hint} spark={spark} delta={delta} href={href} index={index} />;
  const f = r.frames[r.index];
  const upto = r.frames.slice(0, r.index + 1);
  const value = metric === "monthToDate" ? f.monthToDateCents : metric === "visits" ? f.visits : f.newLeads;
  const series = upto.map((x) => (metric === "monthToDate" ? x.monthToDateCents : metric === "visits" ? x.visits : x.newLeads));
  return (
    <StatTile
      label={label}
      figure={{ value: metric === "monthToDate" ? Math.round(value / 100) * 100 : value, kind: figure.kind, hideZeroCents: figure.hideZeroCents }}
      hint={`${metric === "monthToDate" ? "so far" : "that day"} · ${short(f.date)}`}
      spark={series.length > 1 ? series : undefined}
      href={href}
      index={index}
    />
  );
}
