import { describe, expect, it } from "vitest";
import { checkAssignment, dayWindow, hourMarks, instantAtFraction, isBlocked, layoutColumns, moveVisit, placeInDay, snapInstant, type CrewMember } from "./dispatch";

describe("day window", () => {
  it("is 7 AM to 9 PM New York time, as UTC", () => {
    expect(dayWindow("2026-10-26").start.toISOString()).toBe("2026-10-26T11:00:00.000Z"); // EDT
    expect(dayWindow("2026-11-02").start.toISOString()).toBe("2026-11-02T12:00:00.000Z"); // EST
    expect(dayWindow("2026-10-26").end.toISOString()).toBe("2026-10-27T01:00:00.000Z");
  });

  it("positions hour marks by elapsed time on a 14-hour day and across fall-back", () => {
    const marks = hourMarks("2026-10-26");
    expect(marks).toHaveLength(15);
    expect(marks[0]).toEqual({ label: "7 AM", fraction: 0 });
    expect(marks[5].label).toBe("12 PM");
    expect(marks[5].fraction).toBeCloseTo(5 / 14, 5);
    // The clock change happens at 2 AM, before the window, so the window is
    // still 14 real hours on the fall-back day (Nov 1 2026) and spring-forward (Mar 14 2027).
    for (const day of ["2026-11-01", "2027-03-14"]) {
      const m = hourMarks(day);
      expect(m[0].fraction).toBe(0);
      expect(m.at(-1)?.fraction).toBe(1);
      expect(m[1].fraction).toBeCloseTo(1 / 14, 5);
    }
    expect(dayWindow("2026-11-01").start.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
});

describe("placeInDay", () => {
  it("places a 9 AM to 11:30 AM visit within the window", () => {
    const p = placeInDay("2026-10-26", "2026-10-26T13:00:00Z", "2026-10-26T15:30:00Z");
    expect(p?.top).toBeCloseTo(2 / 14, 5);
    expect(p?.height).toBeCloseTo(2.5 / 14, 5);
    expect(p?.clippedStart).toBe(false);
  });

  it("clamps visits that straddle the window and drops those outside it", () => {
    const early = placeInDay("2026-10-26", "2026-10-26T09:00:00Z", "2026-10-26T13:00:00Z"); // 5 AM - 9 AM
    expect(early).toMatchObject({ top: 0, clippedStart: true });
    expect(placeInDay("2026-10-26", "2026-10-26T03:00:00Z", "2026-10-26T05:00:00Z")).toBeNull();
    expect(placeInDay("2026-10-26", "2026-10-27T01:30:00Z", "2026-10-27T03:00:00Z")).toBeNull();
  });
});

describe("snapping and moving", () => {
  it("snaps to the nearest 15 minutes", () => {
    expect(snapInstant(new Date("2026-10-26T13:07:00Z")).toISOString()).toBe("2026-10-26T13:00:00.000Z");
    expect(snapInstant(new Date("2026-10-26T13:08:00Z")).toISOString()).toBe("2026-10-26T13:15:00.000Z");
    expect(instantAtFraction("2026-10-26", 2 / 14 + 0.003).toISOString()).toBe("2026-10-26T13:00:00.000Z");
    expect(instantAtFraction("2026-10-26", 5).toISOString()).toBe("2026-10-27T01:00:00.000Z"); // clamped to 9 PM
  });

  it("keeps the duration when moving", () => {
    const moved = moveVisit("2026-10-26T13:00:00Z", "2026-10-26T15:30:00Z", new Date("2026-10-26T17:00:00Z"));
    expect(moved.end.toISOString()).toBe("2026-10-26T19:30:00.000Z");
  });
});

describe("layoutColumns", () => {
  const v = (id: string, s: string, e: string) => ({ id, start: `2026-10-26T${s}:00Z`, end: `2026-10-26T${e}:00Z` });

  it("gives non-overlapping visits one full-width column", () => {
    const l = layoutColumns([v("a", "13:00", "15:00"), v("b", "15:00", "17:00")]);
    expect(l.get("a")).toEqual({ column: 0, columns: 1 });
    expect(l.get("b")).toEqual({ column: 0, columns: 1 });
  });

  it("places overlapping visits side by side", () => {
    const l = layoutColumns([v("a", "13:00", "16:00"), v("b", "14:00", "15:00"), v("c", "14:30", "17:00")]);
    expect(l.get("a")).toEqual({ column: 0, columns: 3 });
    expect(l.get("b")).toEqual({ column: 1, columns: 3 });
    expect(l.get("c")).toEqual({ column: 2, columns: 3 });
  });

  it("reuses a freed column and sizes each cluster independently", () => {
    const l = layoutColumns([v("a", "13:00", "14:00"), v("b", "13:30", "15:00"), v("c", "14:00", "15:30"), v("d", "18:00", "19:00")]);
    expect(l.get("c")).toEqual({ column: 0, columns: 2 });
    expect(l.get("d")).toEqual({ column: 0, columns: 1 });
  });
});

describe("checkAssignment", () => {
  const sub: CrewMember = { id: "s1", name: "Ana", status: "active", coiExpiresOn: "2027-06-01", boroughs: ["queens", "brooklyn"] };
  const visit = { id: "v", start: "2026-10-26T13:00:00Z", end: "2026-10-26T15:00:00Z", borough: "brooklyn" };
  const kinds = (c: ReturnType<typeof checkAssignment>) => c.map((x) => `${x.severity}:${x.kind}`);

  it("is clean for a free, insured, covered cleaner", () => {
    expect(checkAssignment(visit, sub, [])).toEqual([]);
  });

  it("blocks double-booking (overlap) but not back-to-back in the same borough", () => {
    const overlap = { id: "o", start: "2026-10-26T14:00:00Z", end: "2026-10-26T16:00:00Z", borough: "brooklyn" };
    expect(kinds(checkAssignment(visit, sub, [overlap]))).toEqual(["block:double_booked"]);
    expect(isBlocked(checkAssignment(visit, sub, [overlap]))).toBe(true);
    const adjacent = { id: "o", start: "2026-10-26T15:00:00Z", end: "2026-10-26T17:00:00Z", borough: "brooklyn" };
    expect(checkAssignment(visit, sub, [adjacent])).toEqual([]);
  });

  it("ignores the visit itself and warns only on short cross-borough travel", () => {
    expect(checkAssignment(visit, sub, [{ ...visit }])).toEqual([]);
    const near = { id: "o", start: "2026-10-26T15:20:00Z", end: "2026-10-26T17:00:00Z", borough: "queens" };
    expect(kinds(checkAssignment(visit, sub, [near]))).toEqual(["warn:travel"]);
    const far = { id: "o", start: "2026-10-26T16:00:00Z", end: "2026-10-26T17:00:00Z", borough: "queens" };
    expect(checkAssignment(visit, sub, [far])).toEqual([]);
  });

  it("blocks expired insurance and inactive cleaners; warns when expiring or out of area", () => {
    expect(kinds(checkAssignment(visit, { ...sub, coiExpiresOn: "2026-10-25" }, []))).toEqual(["block:insurance_expired"]);
    expect(kinds(checkAssignment(visit, { ...sub, coiExpiresOn: "2026-11-10" }, []))).toEqual(["warn:insurance_expiring"]);
    expect(kinds(checkAssignment(visit, { ...sub, status: "inactive" }, []))).toEqual(["block:inactive"]);
    expect(kinds(checkAssignment({ ...visit, borough: "bronx" }, sub, []))).toEqual(["warn:borough_not_covered"]);
  });

  it("judges insurance by the visit's New York date, not UTC", () => {
    // 9:30 PM on Oct 25 in NY is already Oct 26 in UTC; insurance through Oct 25
    // is still valid that evening (expiring, not expired).
    const lateVisit = { id: "v", start: "2026-10-26T01:30:00Z", end: "2026-10-26T03:00:00Z", borough: null };
    expect(kinds(checkAssignment(lateVisit, { ...sub, coiExpiresOn: "2026-10-25" }, []))).toEqual(["warn:insurance_expiring"]);
    expect(kinds(checkAssignment(lateVisit, { ...sub, coiExpiresOn: "2026-10-24" }, []))).toEqual(["block:insurance_expired"]);
  });
});
