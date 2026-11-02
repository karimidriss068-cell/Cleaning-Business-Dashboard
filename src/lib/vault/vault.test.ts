import { describe, expect, it } from "vitest";
import { boxFaces, drawFaces, project, ringSegmentFaces, rotate, shadeShare, type View } from "./engine3d";
import { bandPath, flowNodes, layoutSankey } from "./sankey";
import { buildReplay } from "./replay";
import { settled, stepSpring } from "./spring";

const view: View = { yaw: 0.6, pitch: 0.5, scale: 100, cx: 300, cy: 200, distance: 9 };

describe("engine3d", () => {
  it("rotating by zero changes nothing and a full turn returns home", () => {
    expect(rotate([1, 2, 3], 0, 0)).toEqual([1, 2, 3]);
    const r = rotate([1, 2, 3], Math.PI * 2, 0);
    expect(r[0]).toBeCloseTo(1);
    expect(r[2]).toBeCloseTo(3);
  });
  it("projects the origin to the view centre", () => {
    const [x, y] = project([0, 0, 0], view);
    expect(x).toBeCloseTo(300);
    expect(y).toBeCloseTo(200);
  });
  it("a box seen from above shows at most 3 faces and sorts far to near", () => {
    const faces = drawFaces(boxFaces(0, 0, 1, 1, 1, "a"), view);
    expect(faces.length).toBeLessThanOrEqual(3);
    expect(faces.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < faces.length; i++) expect(faces[i].depth).toBeGreaterThanOrEqual(faces[i - 1].depth);
  });
  it("a ring segment has a top, walls and two caps, and renders paths", () => {
    const faces = ringSegmentFaces(0, Math.PI / 2, 0.5, 1, 0.3, "x");
    expect(faces.length).toBeGreaterThan(5);
    const drawn = drawFaces(faces, view);
    expect(drawn.length).toBeGreaterThan(0);
    for (const f of drawn) expect(f.d).toMatch(/^M[\d.,\-L]+Z$/);
  });
  it("shade stays between a floor and 1", () => {
    expect(shadeShare(0)).toBeGreaterThan(0.4);
    expect(shadeShare(5)).toBeCloseTo(1);
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

describe("spring", () => {
  it("settles on the target and never explodes on a long frame", () => {
    let s = { x: 0, v: 0 };
    for (let i = 0; i < 240; i++) s = stepSpring(s, 1, 1 / 60);
    expect(settled(s, 1)).toBe(true);
    const big = stepSpring({ x: 0, v: 0 }, 1, 5);
    expect(Math.abs(big.x)).toBeLessThan(5);
  });
});
