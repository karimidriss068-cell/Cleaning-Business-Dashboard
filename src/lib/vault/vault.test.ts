import { describe, expect, it } from "vitest";
import { insideOut, layoutStream, ribbonPath, smoothPath } from "./stream";
import { bandPath, flowNodes, layoutSankey } from "./sankey";
import { buildReplay } from "./replay";

describe("stream", () => {
  const series = [
    { key: "a", label: "A", values: [1, 2, 3, 4] },
    { key: "b", label: "B", values: [4, 3, 2, 1] },
    { key: "c", label: "C", values: [0, 1, 0, 1] },
  ];
  it("puts the biggest ribbon in the middle", () => {
    const o = insideOut([{ total: 1 }, { total: 9 }, { total: 5 }, { total: 3 }]);
    expect(o.map((x) => x.total)).toEqual([1, 5, 9, 3]);
  });
  it("stacks ribbons edge to edge, centred, with heights in proportion", () => {
    const { layers, max } = layoutStream(series, 600, 200, 0);
    expect(max).toBe(6);
    for (let i = 0; i < 4; i++) {
      const sorted = [...layers].sort((p, q) => p.top[i][1] - q.top[i][1]);
      for (let k = 0; k < sorted.length - 1; k++) expect(sorted[k].bottom[i][1]).toBeCloseTo(sorted[k + 1].top[i][1], 5);
      const top = sorted[0].top[i][1];
      const bottom = sorted[sorted.length - 1].bottom[i][1];
      expect((top + bottom) / 2).toBeCloseTo(100, 5);
    }
    const a = layers.find((l) => l.key === "a")!;
    expect(a.bottom[3][1] - a.top[3][1]).toBeCloseTo((4 / 6) * 200, 5);
  });
  it("handles empty data and a single week", () => {
    expect(layoutStream([], 600, 200).layers).toEqual([]);
    expect(layoutStream([{ key: "a", label: "A", values: [0, 0] }], 600, 200).layers).toEqual([]);
    expect(layoutStream([{ key: "a", label: "A", values: [3] }], 600, 200).layers[0].top).toHaveLength(2);
  });
  it("smooth paths never overshoot their points and ribbons close", () => {
    const d = smoothPath([[0, 0], [10, 10], [20, 10], [30, 0]]);
    const ys = [...d.matchAll(/(-?\d+\.\d),(-?\d+\.\d)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(10);
    const { layers } = layoutStream(series, 600, 200);
    expect(ribbonPath(layers[0])).toMatch(/^M.*Z$/);
  });
});

describe("sankey", () => {
  it("splits revenue into costs and profit with equal totals on both sides", () => {
    const { sources, sinks } = flowNodes({ revenueCents: 10_000, subPayCents: 4_000, adSpendCents: 1_000, otherCostsCents: 500 });
    expect(sources.map((n) => n.key)).toEqual(["revenue"]);
    expect(sinks.map((n) => [n.key, n.cents])).toEqual([["pay", 4000], ["ads", 1000], ["other", 500], ["profit", 4500]]);
    const l = layoutSankey(sources, sinks, 300);
    expect(l.bands.reduce((a, b) => a + b.cents, 0)).toBe(10_000);
    const sinkH = l.right.reduce((a, n) => a + n.h, 0);
    const bandH = l.bands.reduce((a, b) => a + b.h, 0);
    expect(bandH).toBeCloseTo(sinkH, 5);
  });
  it("a loss is covered from cash and has no profit node", () => {
    const { sources, sinks } = flowNodes({ revenueCents: 1_000, subPayCents: 800, adSpendCents: 500, otherCostsCents: 0 });
    expect(sources.map((n) => n.key)).toEqual(["revenue", "cash"]);
    expect(sinks.some((n) => n.key === "profit")).toBe(false);
    expect(sources.reduce((a, n) => a + n.cents, 0)).toBe(sinks.reduce((a, n) => a + n.cents, 0));
  });
  it("zero everything lays out nothing; band paths close", () => {
    expect(layoutSankey([], [], 200).bands).toEqual([]);
    expect(bandPath(0, 100, 10, 50, 20)).toMatch(/^M.*Z$/);
  });
});

describe("replay", () => {
  const days = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"];
  const daily = days.map((day, i) => ({ day, cents: (i + 1) * 100_00 }));
  const milestones = [{ monthStart: "2026-11-01", targetCents: 30_000_00, actualCents: 0 }];
  it("restarts the running total at a new month and keeps pace only inside a planned month", () => {
    const f = buildReplay({ daily, visitsByDay: { "2026-11-02": 3 }, leadsByDay: { "2026-10-31": 2 }, milestones, frames: 4 });
    expect(f.map((x) => x.monthToDateCents)).toEqual([10_000, 30_000, 30_000, 70_000]);
    expect(f[0].pace).toBeNull();
    expect(f[2].pace?.milestoneCents).toBe(30_000_00);
    expect(f[3].visits).toBe(3);
    expect(f[1].newLeads).toBe(2);
  });
  it("returns only the last N frames but sums the whole month", () => {
    const f = buildReplay({ daily, visitsByDay: {}, leadsByDay: {}, milestones, frames: 2 });
    expect(f.map((x) => x.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(f[1].monthToDateCents).toBe(700_00);
  });
});
