// Layout for the revenue-to-profit flow: one source column, one sink column,
// bands sized in cents. All geometry is plain numbers so it can be tested.

export type FlowNode = { key: string; label: string; cents: number; tone: "revenue" | "cost" | "profit" | "loss" | "cash" };
export type SankeyBand = { from: string; to: string; cents: number; y0: number; y1: number; h: number };
export type SankeyLayout = {
  left: (FlowNode & { y: number; h: number })[];
  right: (FlowNode & { y: number; h: number })[];
  bands: SankeyBand[];
  total: number;
};

/**
 * Money in on the left (revenue, plus cash covering a shortfall), money out on
 * the right (costs, then profit if positive). Both columns sum to the same
 * total, so a loss shows as costs larger than revenue with a "from cash" input.
 */
export function flowNodes(m: { revenueCents: number; subPayCents: number; adSpendCents: number; otherCostsCents: number }): { sources: FlowNode[]; sinks: FlowNode[] } {
  const costs = m.subPayCents + m.adSpendCents + m.otherCostsCents;
  const net = m.revenueCents - costs;
  const sources: FlowNode[] = [{ key: "revenue", label: "Revenue", cents: Math.max(0, m.revenueCents), tone: "revenue" }];
  const sinks: FlowNode[] = [
    { key: "pay", label: "Cleaner pay", cents: m.subPayCents, tone: "cost" },
    { key: "ads", label: "Ad spend", cents: m.adSpendCents, tone: "cost" },
    { key: "other", label: "Other costs", cents: m.otherCostsCents, tone: "cost" },
  ];
  if (net >= 0) sinks.push({ key: "profit", label: "Profit", cents: net, tone: "profit" });
  else sources.push({ key: "cash", label: "Covered from cash", cents: -net, tone: "cash" });
  return { sources: sources.filter((n) => n.cents > 0), sinks: sinks.filter((n) => n.cents > 0) };
}

export function layoutSankey(sources: FlowNode[], sinks: FlowNode[], height: number, gap = 14): SankeyLayout {
  const total = Math.max(sources.reduce((a, n) => a + n.cents, 0), sinks.reduce((a, n) => a + n.cents, 0));
  if (total <= 0) return { left: [], right: [], bands: [], total: 0 };
  // One scale for both columns, so a band is the same thickness at both ends.
  const usable = Math.max(1, height - gap * (Math.max(sources.length, sinks.length) - 1));
  const place = (nodes: FlowNode[]) => {
    let y = 0;
    return nodes.map((n) => {
      const h = (n.cents / total) * usable;
      const placed = { ...n, y, h };
      y += h + gap;
      return placed;
    });
  };
  const left = place(sources);
  const right = place(sinks);
  // Each source feeds every sink in proportion to the sink's size; a source's band to a sink is its share of that sink.
  const sinkTotal = sinks.reduce((a, n) => a + n.cents, 0);
  const sourceTotal = sources.reduce((a, n) => a + n.cents, 0);
  const bands: SankeyBand[] = [];
  const leftCursor = left.map((n) => n.y);
  const rightCursor = right.map((n) => n.y);
  left.forEach((s, si) => {
    right.forEach((t, ti) => {
      const cents = sinkTotal > 0 && sourceTotal > 0 ? (s.cents / sourceTotal) * t.cents : 0;
      if (cents <= 0) return;
      const h = (cents / total) * usable;
      bands.push({ from: s.key, to: t.key, cents: Math.round(cents), y0: leftCursor[si], y1: rightCursor[ti], h });
      leftCursor[si] += h;
      rightCursor[ti] += h;
    });
  });
  return { left, right, bands, total };
}

/** Cubic band from x0 to x1: top edge then back along the bottom edge. */
export function bandPath(x0: number, x1: number, y0: number, y1: number, h: number): string {
  const mx = (x0 + x1) / 2;
  const f = (n: number) => n.toFixed(1);
  return `M${f(x0)},${f(y0)}C${f(mx)},${f(y0)} ${f(mx)},${f(y1)} ${f(x1)},${f(y1)}L${f(x1)},${f(y1 + h)}C${f(mx)},${f(y1 + h)} ${f(mx)},${f(y0 + h)} ${f(x0)},${f(y0 + h)}Z`;
}
