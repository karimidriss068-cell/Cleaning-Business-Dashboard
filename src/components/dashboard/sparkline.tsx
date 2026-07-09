"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

/**
 * Tiny inline trend line for inside a KPI card — no axes, no tooltip, just
 * a whisper of recent history behind/beside the hero number. The signature
 * "premium fintech app" detail.
 */
export function Sparkline({
  data,
  dataKey,
  color = "var(--accent-bright)",
  height = 44,
  className,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  color?: string;
  height?: number;
  className?: string;
}) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  if (data.length < 2) return null;

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
