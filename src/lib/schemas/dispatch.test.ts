import { describe, expect, it } from "vitest";
import { mapReassignError, reassignInputSchema } from "./dispatch";

const base = {
  jobId: "5eed0000-0010-4000-8000-000000000001",
  expectedUpdatedAt: "2026-10-26T13:00:00.123456+00:00",
  crewId: null,
  subcontractorIds: [],
  start: "2026-10-27T13:00:00Z",
  end: "2026-10-27T15:00:00Z",
};

describe("reassign input", () => {
  it("accepts a valid move, including an unassign", () => {
    expect(reassignInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects bad ids, reversed times and blank override reasons", () => {
    expect(reassignInputSchema.safeParse({ ...base, jobId: "nope" }).success).toBe(false);
    expect(reassignInputSchema.safeParse({ ...base, end: base.start }).success).toBe(false);
    expect(reassignInputSchema.safeParse({ ...base, overrideReason: "  " }).success).toBe(false);
    expect(reassignInputSchema.safeParse({ ...base, subcontractorIds: ["x"] }).success).toBe(false);
  });
});

describe("reassign error mapping", () => {
  it("maps database codes to friendly results", () => {
    expect(mapReassignError({ code: "KC001" })).toMatchObject({ code: "stale" });
    expect(mapReassignError({ code: "KC002", message: "blocked: double_booked: Luis" })).toEqual({ ok: false, code: "blocked", message: "double_booked: Luis" });
    expect(mapReassignError({ code: "KC003" })).toMatchObject({ code: "settled" });
    expect(mapReassignError({ code: "42501" })).toMatchObject({ code: "forbidden" });
    expect(mapReassignError({ code: "XX000", message: "secret internals" })).toEqual({ ok: false, code: "error", message: "Couldn't move the visit. Try again." });
  });
});
