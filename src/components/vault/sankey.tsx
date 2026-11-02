"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { bandPath, flowNodes, layoutSankey, type FlowNode } from "@/lib/vault/sankey";
import { money } from "@/components/growth/format";

const W = 720;
const H = 230;
const NODE_W = 8;
const LABEL_W = 150;

const toneVar: Record<FlowNode["tone"], string> = {
  revenue: "var(--kc-chart1)",
  cost: "var(--kc-chart3)",
  profit: "var(--kc-chart4)",
  loss: "var(--kc-danger-fill)",
  cash: "var(--kc-chart2)",
};

/**
 * Where a month's revenue goes: cleaner pay, ads and other costs, and what is
 * left as profit (or, in a loss, the cash that covered it). Bands draw in from
 * the left once; hover or focus a node or band to isolate its flow.
 */
export function Sankey({ month, ariaLabel }: { month: { revenueCents: number; subPayCents: number; adSpendCents: number; otherCostsCents: number }; ariaLabel: string }) {
  const [hot, setHot] = useState<string | null>(null);
  const { sources, sinks } = useMemo(() => flowNodes(month), [month]);
  const layout = useMemo(() => layoutSankey(sources, sinks, H - 20), [sources, sinks]);
  if (layout.total <= 0) return null;
  const x0 = LABEL_W + NODE_W;
  const x1 = W - LABEL_W - NODE_W;
  const live = (...keys: string[]) => hot === null || keys.includes(hot);

  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full min-w-[560px]" data-testid="sankey" onPointerLeave={() => setHot(null)}>
      <defs>
        {layout.bands.map((b) => (
          <linearGradient key={`${b.from}-${b.to}`} id={`kc-sk-${b.from}-${b.to}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={toneVar[layout.left.find((n) => n.key === b.from)?.tone ?? "revenue"]} stopOpacity="0.38" />
            <stop offset="1" stopColor={toneVar[layout.right.find((n) => n.key === b.to)?.tone ?? "cost"]} stopOpacity="0.38" />
          </linearGradient>
        ))}
      </defs>
      <g transform="translate(0 10)">
        {layout.bands.map((b, i) => (
          <path
            key={`${b.from}-${b.to}`}
            d={bandPath(x0, x1, b.y0, b.y1, b.h)}
            fill={`url(#kc-sk-${b.from}-${b.to})`}
            className="kc-sankey-band"
            style={{ opacity: live(b.from, b.to) ? 1 : 0.12, animationDelay: `${i * 70}ms`, transition: "opacity 200ms" }}
            onPointerEnter={() => setHot(b.to)}
          />
        ))}
        {layout.left.map((n) => (
          <g key={n.key} onPointerEnter={() => setHot(n.key)} style={{ opacity: live(n.key) || layout.bands.some((b) => b.from === n.key && live(b.to)) ? 1 : 0.35, transition: "opacity 200ms" }}>
            <rect x={LABEL_W} y={n.y} width={NODE_W} height={Math.max(2, n.h)} rx={4} style={{ fill: toneVar[n.tone] }} />
            <text x={LABEL_W - 10} y={n.y + n.h / 2 - 2} textAnchor="end" className="fill-ink" style={{ fontSize: 13, fontWeight: 500 }}>{n.label}</text>
            <text x={LABEL_W - 10} y={n.y + n.h / 2 + 14} textAnchor="end" className="fill-ink-muted" style={{ fontSize: 12 }}>{money(n.cents)}</text>
          </g>
        ))}
        {layout.right.map((n) => (
          <g key={n.key} onPointerEnter={() => setHot(n.key)} style={{ opacity: live(n.key) || layout.bands.some((b) => b.to === n.key && live(b.from)) ? 1 : 0.35, transition: "opacity 200ms" }}>
            <rect x={W - LABEL_W - NODE_W} y={n.y} width={NODE_W} height={Math.max(2, n.h)} rx={4} style={{ fill: toneVar[n.tone] }} />
            <text x={W - LABEL_W + 10} y={n.y + n.h / 2 - 2} className="fill-ink" style={{ fontSize: 13, fontWeight: 500 }}>{n.label}</text>
            <text x={W - LABEL_W + 10} y={n.y + n.h / 2 + 14} className={cn(n.tone === "profit" ? "fill-success" : "fill-ink-muted")} style={{ fontSize: 12 }}>{money(n.cents)}</text>
          </g>
        ))}
      </g>
    </svg></div>
  );
}
