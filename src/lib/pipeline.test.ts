import { describe, expect, it } from "vitest";
import { DEFAULT_WIN_BPS, bidDueState, pipelineTotals, weightedValueCents, winProbabilityBps } from "@/lib/pipeline";

describe("win probability", () => {
  it("uses the stage default until the owner sets one", () => {
    expect(winProbabilityBps({ stage: "quoted", winProbabilityBps: null })).toBe(DEFAULT_WIN_BPS.quoted);
    expect(winProbabilityBps({ stage: "quoted", winProbabilityBps: 4000 })).toBe(4000);
    expect(winProbabilityBps({ stage: "new", winProbabilityBps: 0 })).toBe(0);
  });
});

describe("weighted value", () => {
  it("multiplies the expected value by the chance, in whole cents", () => {
    expect(weightedValueCents({ stage: "quoted", expectedValueCents: 750000, winProbabilityBps: null })).toBe(187500);
    expect(weightedValueCents({ stage: "follow_up", expectedValueCents: 333333, winProbabilityBps: 3333 })).toBe(Math.round((333333 * 3333) / 10000));
  });
  it("counts nothing without a value or once the lead is closed", () => {
    expect(weightedValueCents({ stage: "quoted", expectedValueCents: null, winProbabilityBps: null })).toBe(0);
    expect(weightedValueCents({ stage: "won", expectedValueCents: 750000, winProbabilityBps: null })).toBe(0);
    expect(weightedValueCents({ stage: "lost", expectedValueCents: 750000, winProbabilityBps: null })).toBe(0);
  });
  it("totals open value and weighted value", () => {
    const t = pipelineTotals([
      { stage: "new", expectedValueCents: 500000, winProbabilityBps: null },
      { stage: "quoted", expectedValueCents: 1000000, winProbabilityBps: 5000 },
      { stage: "won", expectedValueCents: 900000, winProbabilityBps: null },
    ]);
    expect(t).toEqual({ openValueCents: 1500000, weightedCents: 50000 + 500000 });
  });
});

describe("bidDueState", () => {
  const today = "2026-11-10";
  it("flags overdue, today, soon and later for bids not yet sent", () => {
    expect(bidDueState("2026-11-09", "new", today)).toBe("overdue");
    expect(bidDueState("2026-11-10", "site_visit", today)).toBe("today");
    expect(bidDueState("2026-11-13", "site_visit", today)).toBe("soon");
    expect(bidDueState("2026-11-14", "new", today)).toBe("later");
  });
  it("is quiet once the bid is out, closed, or has no date", () => {
    expect(bidDueState("2026-11-09", "quoted", today)).toBeNull();
    expect(bidDueState("2026-11-09", "won", today)).toBeNull();
    expect(bidDueState(null, "new", today)).toBeNull();
  });
  it("works across a month and a DST change", () => {
    expect(bidDueState("2026-12-01", "new", "2026-11-29")).toBe("soon");
    expect(bidDueState("2026-11-03", "new", "2026-11-01")).toBe("soon");
  });
});
