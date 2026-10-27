import { describe, expect, it } from "vitest";
import { occurrences, parseRule, planVisits } from "./recurrence";

const series = (over: Partial<Parameters<typeof planVisits>[0]> = {}) => ({
  id: "s1",
  recurrence_rule: "FREQ=WEEKLY;BYDAY=TU",
  start_date: "2026-10-04",
  end_date: null,
  generated_through: null,
  local_start_time: "09:00:00",
  duration_minutes: 150,
  ...over,
});

describe("recurrence rules", () => {
  it("parses the supported subset and rejects the rest", () => {
    expect(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH")).toMatchObject({ freq: "WEEKLY", interval: 2, byDay: [1, 4] });
    expect(parseRule("RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15")).toMatchObject({ freq: "MONTHLY", byMonthDay: [1, 15] });
    expect(parseRule("FREQ=WEEKLY;UNTIL=20261231T000000Z").until).toBe("2026-12-31");
    expect(() => parseRule("FREQ=YEARLY")).toThrow();
    expect(() => parseRule("FREQ=WEEKLY;BYDAY=XX")).toThrow();
  });

  it("expands weekly, every other week (Sunday-start weeks), multiple days", () => {
    expect(occurrences(parseRule("FREQ=WEEKLY;BYDAY=TU"), "2026-10-04", "2026-10-01", "2026-10-21")).toEqual(["2026-10-06", "2026-10-13", "2026-10-20"]);
    expect(occurrences(parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"), "2026-10-04", "2026-10-01", "2026-11-04")).toEqual(["2026-10-06", "2026-10-20", "2026-11-03"]);
    expect(occurrences(parseRule("FREQ=WEEKLY;BYDAY=MO,TH"), "2026-10-05", "2026-10-05", "2026-10-12")).toEqual(["2026-10-05", "2026-10-08", "2026-10-12"]);
  });

  it("expands daily and monthly", () => {
    expect(occurrences(parseRule("FREQ=DAILY;INTERVAL=3"), "2026-10-01", "2026-10-01", "2026-10-10")).toEqual(["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"]);
    expect(occurrences(parseRule("FREQ=MONTHLY;BYMONTHDAY=1,15"), "2026-10-01", "2026-10-01", "2026-11-20")).toEqual(["2026-10-01", "2026-10-15", "2026-11-01", "2026-11-15"]);
  });
});

describe("planVisits", () => {
  it("keeps 9:00 AM New York across the fall-back DST change", () => {
    const { visits } = planVisits(series(), "2026-10-26", 14);
    expect(visits.map((v) => v.start.toISOString())).toEqual(["2026-10-27T13:00:00.000Z", "2026-11-03T14:00:00.000Z"]);
    expect(visits[0].end.toISOString()).toBe("2026-10-27T15:30:00.000Z");
  });

  it("plans 8 weeks ahead by default and reports the new generated_through", () => {
    const { visits, generatedThrough } = planVisits(series(), "2026-10-26");
    expect(visits).toHaveLength(8);
    expect(generatedThrough).toBe("2026-12-21");
  });

  it("starts after generated_through, so a rerun plans nothing new", () => {
    const first = planVisits(series(), "2026-10-26");
    const again = planVisits(series({ generated_through: first.generatedThrough }), "2026-10-26");
    expect(again.visits).toEqual([]);
  });

  it("stops at the series end date and never plans the past", () => {
    expect(planVisits(series({ end_date: "2026-11-05" }), "2026-10-26").visits.map((v) => v.date)).toEqual(["2026-10-27", "2026-11-03"]);
    expect(planVisits(series({ end_date: "2026-10-01" }), "2026-10-26").visits).toEqual([]);
  });
});
