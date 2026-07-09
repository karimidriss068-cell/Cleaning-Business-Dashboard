"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { PulsingEndDot } from "./pulsing-end-dot";
import { money, num } from "@/lib/format";

const tickStyle = {
  fill: "var(--text-muted)",
  fontSize: 11,
  letterSpacing: "0.03em",
};

const FORMATTERS = { money, num } as const;

/**
 * The dashboard's centerpiece chart — solid crimson line with a glow, a
 * gradient fill fading to transparent, a slow deliberate left-to-right draw
 * on load, and a "radar ping" marking the most recent data point so the
 * chart reads as alive rather than a static report.
 *
 * `format` is a key rather than a function since this is a Client Component
 * and functions can't cross the server/client boundary as props.
 */
export function TrendAreaChart({
  data,
  xKey,
  yKey,
  format,
  gradientId,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  yKey: string;
  format: keyof typeof FORMATTERS;
  gradientId: string;
}) {
  const formatter = FORMATTERS[format];
  const lastValid = [...data].reverse().find((d) => d[yKey] != null);

  return (
    <div className="chart-glow">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-bright)" stopOpacity={0.22} />
              <stop offset="95%" stopColor="var(--accent-bright)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={tickStyle}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={formatter}
          />
          <Tooltip
            cursor={{ stroke: "var(--accent-bright)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={<ChartTooltip formatter={formatter} />}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke="var(--accent-bright)"
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={false}
            connectNulls={false}
            isAnimationActive
            animationDuration={1000}
            animationEasing="ease-out"
          />
          {lastValid && (
            <ReferenceDot
              x={lastValid[xKey] as string}
              y={lastValid[yKey] as number}
              r={0}
              shape={(props: { cx?: number; cy?: number }) => (
                <PulsingEndDot cx={props.cx} cy={props.cy} />
              )}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
