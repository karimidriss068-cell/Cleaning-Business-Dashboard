// Layout for the channel stream chart: one smooth ribbon per channel, stacked
// around a centre line so the whole reads as a single flowing band. Pure.

export type StreamSeries = { key: string; label: string; values: number[] };
export type Pt = [number, number];
export type StreamLayer = { key: string; label: string; total: number; top: Pt[]; bottom: Pt[] };

/** Biggest ribbon in the middle, the others alternating outward: keeps the shape calm. */
export function insideOut<T extends { total: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => b.total - a.total);
  const out: T[] = [];
  sorted.forEach((it, i) => (i % 2 === 0 ? out.push(it) : out.unshift(it)));
  return out;
}

export function layoutStream(series: StreamSeries[], width: number, height: number, pad = 4): { layers: StreamLayer[]; max: number } {
  const n = series.reduce((m, s) => Math.max(m, s.values.length), 0);
  if (n === 0) return { layers: [], max: 0 };
  const cols = Math.max(2, n);
  const val = (s: StreamSeries, i: number) => s.values[Math.min(i, s.values.length - 1)] ?? 0;
  const totals = Array.from({ length: cols }, (_, i) => series.reduce((a, s) => a + val(s, i), 0));
  const max = Math.max(...totals, 0);
  if (max <= 0) return { layers: [], max: 0 };
  const scale = (height - pad * 2) / max;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (cols - 1);
  const ordered = insideOut(series.map((s) => ({ ...s, total: s.values.reduce((a, b) => a + b, 0) })));
  const base = totals.map((t) => height / 2 - (t * scale) / 2);
  const cursor = [...base];
  const layers: StreamLayer[] = ordered.map((s) => {
    const top: Pt[] = [];
    const bottom: Pt[] = [];
    for (let i = 0; i < cols; i++) {
      const h = val(s, i) * scale;
      top.push([x(i), cursor[i]]);
      bottom.push([x(i), cursor[i] + h]);
      cursor[i] += h;
    }
    return { key: s.key, label: s.label, total: s.total, top, bottom };
  });
  return { layers, max };
}

/** Monotone cubic through the points (no overshoot, so ribbons never fold over each other). */
export function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n === 1) return `${f(pts[0][0])},${f(pts[0][1])}`;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / (dx[i] || 1));
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

/** Closed ribbon: along the top edge, back along the bottom. */
export function ribbonPath(layer: StreamLayer): string {
  const bottomBack = [...layer.bottom].reverse();
  return `M${smoothPath(layer.top)} L${smoothPath(bottomBack)} Z`;
}
