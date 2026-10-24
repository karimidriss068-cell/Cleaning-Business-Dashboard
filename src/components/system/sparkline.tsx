import { cn } from "@/lib/utils";

/**
 * Inline SVG trend line (DESIGN.md section 10). Decorative: aria-hidden, so
 * the surrounding text must carry the meaning.
 */
export function Sparkline({
  values,
  width = 112,
  height = 32,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const pad = 2.5;
  const n = values.length;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => [
    pad + (n > 1 ? (i * (width - pad * 2)) / (n - 1) : (width - pad * 2) / 2),
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${points[n - 1][0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z` : "";
  const last = points[n - 1];

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0 overflow-visible text-brand", className)}
    >
      {n > 1 && <path d={area} fill="currentColor" fillOpacity={0.1} />}
      {n > 1 && (
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill="currentColor" />}
    </svg>
  );
}
