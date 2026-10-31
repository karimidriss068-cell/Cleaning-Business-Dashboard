import { describe, expect, it } from "vitest";
import { followUpStatus, formatPhone, normalizeEmail, normalizeUsPhone, planStageMove, stageLabel, winRatePercent } from "./leads";

describe("normalizeUsPhone", () => {
  it("accepts common US formats", () => {
    for (const p of ["(718) 555-0142", "718-555-0142", "718.555.0142", "7185550142", "1 718 555 0142", "+1 (718) 555-0142"]) expect(normalizeUsPhone(p)).toBe("+17185550142");
  });
  it("rejects what isn't a US number", () => {
    for (const p of ["", null, undefined, "12345", "0185550142", "+44 20 7946 0958", "718555014"]) expect(normalizeUsPhone(p)).toBeNull();
  });
  it("formats for display", () => {
    expect(formatPhone("+17185550142")).toBe("(718) 555-0142");
    expect(formatPhone(null)).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims, empty becomes null", () => {
    expect(normalizeEmail("  Dana@Example.COM ")).toBe("dana@example.com");
    expect(normalizeEmail("  ")).toBeNull();
  });
});

describe("planStageMove", () => {
  it("does nothing when the stage is unchanged", () => expect(planStageMove("new", "new")).toEqual({ kind: "noop" }));
  it("applies forward and backward moves directly", () => {
    expect(planStageMove("new", "quoted")).toEqual({ kind: "apply", stage: "quoted" });
    expect(planStageMove("won", "contacted")).toEqual({ kind: "apply", stage: "contacted" });
    expect(planStageMove("lost", "new")).toEqual({ kind: "apply", stage: "new" });
  });
  it("asks for a reason before Lost", () => expect(planStageMove("quoted", "lost")).toEqual({ kind: "needs_reason", stage: "lost" }));
  it("labels the stages the way the business says them", () => {
    expect(stageLabel.quoted).toBe("Quote sent");
    expect(stageLabel.won).toBe("Booked");
  });
});

describe("followUpStatus", () => {
  const today = "2026-11-02";
  it("flags overdue, today and upcoming for open leads", () => {
    expect(followUpStatus("2026-11-01", "new", today)).toBe("overdue");
    expect(followUpStatus("2026-11-02", "contacted", today)).toBe("today");
    expect(followUpStatus("2026-11-03", "quoted", today)).toBe("upcoming");
  });
  it("ignores closed leads and missing dates", () => {
    expect(followUpStatus("2026-10-01", "won", today)).toBe("none");
    expect(followUpStatus("2026-10-01", "lost", today)).toBe("none");
    expect(followUpStatus(null, "new", today)).toBe("none");
  });
});

describe("winRatePercent", () => {
  it("is booked over decided leads", () => {
    expect(winRatePercent({ booked: 1, lost: 3 })).toBe(25);
    expect(winRatePercent({ booked: 0, lost: 0 })).toBeNull();
  });
});
