import { describe, expect, it } from "vitest";
import {
  addDays,
  formatCalendarDate,
  formatCents,
  formatNyDate,
  formatNyDateTime,
  formatNyTime,
  nyDateString,
  nyDayRangeUtc,
  nyToday,
  nyWallClock,
  nyWallTimeToUtc,
  nyWeekStart,
  parseDollarsToCents,
  percentOfCents,
} from "./format";

const HOUR = 3_600_000;

describe("formatCents", () => {
  it("formats integer cents without float math", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(100000000)).toBe("$1,000,000.00");
    expect(formatCents(-250)).toBe("-$2.50");
  });

  it("can hide zero cents", () => {
    expect(formatCents(2500, { hideZeroCents: true })).toBe("$25");
    expect(formatCents(2550, { hideZeroCents: true })).toBe("$25.50");
  });

  it("renders null as an em dash", () => {
    expect(formatCents(null)).toBe("—");
    expect(formatCents(undefined)).toBe("—");
  });

  it("throws on non-integer input (a dollar amount passed by mistake)", () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseDollarsToCents", () => {
  it("parses common dollar inputs", () => {
    expect(parseDollarsToCents("$1,234.56")).toBe(123456);
    expect(parseDollarsToCents("1234.5")).toBe(123450);
    expect(parseDollarsToCents("12")).toBe(1200);
    expect(parseDollarsToCents(" $ 5 ")).toBe(500);
    expect(parseDollarsToCents("-3.10")).toBe(-310);
  });

  it("avoids floating-point rounding traps", () => {
    // 0.29 * 100 === 28.999999999999996 in floating point.
    expect(parseDollarsToCents("0.29")).toBe(29);
    expect(parseDollarsToCents("1.15")).toBe(115);
    expect(parseDollarsToCents("0.07")).toBe(7);
  });

  it("rejects anything that isn't a plain dollar amount", () => {
    for (const bad of ["", "abc", "1.234", "1,23", "12,34.00", "$", "1.2.3", "1e3"]) {
      expect(parseDollarsToCents(bad), bad).toBeNull();
    }
  });
});

describe("percentOfCents", () => {
  it("matches the database pay rounding (half up)", () => {
    expect(percentOfCents(20000, 4000)).toBe(8000);
    expect(percentOfCents(333, 5000)).toBe(167); // 166.5 rounds up
    expect(percentOfCents(331, 5000)).toBe(166); // 165.5 rounds up
    expect(percentOfCents(0, 4000)).toBe(0);
  });

  it("rejects negative or fractional input", () => {
    expect(() => percentOfCents(-1, 4000)).toThrow(RangeError);
    expect(() => percentOfCents(100, 40.5)).toThrow(RangeError);
  });
});

describe("NY calendar dates", () => {
  it("uses the New York date, not UTC", () => {
    // 03:30 UTC on Nov 4 is still 10:30 PM on Nov 3 in New York (EST).
    expect(nyDateString("2026-11-04T03:30:00Z")).toBe("2026-11-03");
    // 03:59 UTC on Jul 1 is 11:59 PM on Jun 30 (EDT).
    expect(nyDateString("2026-07-01T03:59:00Z")).toBe("2026-06-30");
    expect(nyDateString("2026-07-01T04:00:00Z")).toBe("2026-07-01");
    expect(nyToday(new Date("2026-12-31T23:30:00-05:00"))).toBe("2026-12-31");
  });

  it("does calendar arithmetic across months, years and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the Monday of the week", () => {
    expect(nyWeekStart("2026-10-23")).toBe("2026-10-19"); // Friday
    expect(nyWeekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(nyWeekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
  });

  it("formats date-only values without shifting a day", () => {
    expect(formatCalendarDate("2026-11-03")).toBe("Nov 3, 2026");
    expect(formatCalendarDate("2027-01-01")).toBe("Jan 1, 2027");
    expect(formatCalendarDate(null)).toBe("—");
  });
});

describe("daylight saving time", () => {
  it("maps 9:00 AM NY to 13:00Z in summer time and 14:00Z in winter time", () => {
    expect(nyWallTimeToUtc("2026-10-26", "09:00").toISOString()).toBe("2026-10-26T13:00:00.000Z");
    expect(nyWallTimeToUtc("2026-11-04", "09:00").toISOString()).toBe("2026-11-04T14:00:00.000Z");
    expect(nyWallTimeToUtc("2027-03-15", "09:00").toISOString()).toBe("2027-03-15T13:00:00.000Z");
  });

  it("fall back (Nov 1, 2026): 1:30 AM happens twice; returns the first (EDT)", () => {
    const first = nyWallTimeToUtc("2026-11-01", "01:30");
    expect(first.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    // The second 1:30 AM (EST) is an hour later and reads the same on the clock.
    const second = new Date(first.getTime() + HOUR);
    expect(nyWallClock(second)).toEqual({ date: "2026-11-01", time: "01:30" });
    expect(formatNyTime(first)).toBe("1:30 AM");
    expect(formatNyTime(second)).toBe("1:30 AM");
  });

  it("spring forward (Mar 14, 2027): 2:30 AM doesn't exist; shifts to 3:30 AM EDT", () => {
    const shifted = nyWallTimeToUtc("2027-03-14", "02:30");
    expect(shifted.toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(nyWallClock(shifted)).toEqual({ date: "2027-03-14", time: "03:30" });
    // Times just around the gap are exact.
    expect(nyWallTimeToUtc("2027-03-14", "01:59").toISOString()).toBe("2027-03-14T06:59:00.000Z");
    expect(nyWallTimeToUtc("2027-03-14", "03:00").toISOString()).toBe("2027-03-14T07:00:00.000Z");
  });

  it("gives 25-hour, 23-hour and 24-hour NY days", () => {
    const hours = (date: string) => {
      const { start, end } = nyDayRangeUtc(date);
      return (end.getTime() - start.getTime()) / HOUR;
    };
    expect(hours("2026-11-01")).toBe(25);
    expect(hours("2027-03-14")).toBe(23);
    expect(hours("2026-10-23")).toBe(24);
    expect(nyDayRangeUtc("2026-11-01").start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(nyDayRangeUtc("2026-11-01").end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("round-trips every quarter hour of both transition days", () => {
    for (const date of ["2026-11-01", "2027-03-14"]) {
      for (let m = 0; m < 24 * 60; m += 15) {
        const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const wall = nyWallClock(nyWallTimeToUtc(date, time));
        if (date === "2027-03-14" && time >= "02:00" && time < "03:00") {
          expect(wall.time, time).toBe(`03:${time.slice(3)}`); // the gap shifts forward
        } else {
          expect(wall, `${date} ${time}`).toEqual({ date, time });
        }
      }
    }
  });
});

describe("NY display formatting", () => {
  it("formats instants in New York time", () => {
    expect(formatNyDate("2026-11-04T03:30:00Z")).toBe("Nov 3, 2026");
    expect(formatNyDate("2026-11-04T14:00:00Z", "weekday")).toBe("Wed, Nov 4");
    expect(formatNyTime("2026-11-04T14:00:00Z")).toBe("9:00 AM");
    expect(formatNyDateTime("2026-10-26T22:30:00Z")).toBe("Mon, Oct 26, 6:30 PM");
  });

  it("renders missing or invalid values as an em dash", () => {
    expect(formatNyDate(null)).toBe("—");
    expect(formatNyTime("not a date")).toBe("—");
    expect(formatNyDateTime(undefined)).toBe("—");
  });

  it("rejects malformed date and time strings", () => {
    expect(() => nyWallTimeToUtc("2026-1-5", "09:00")).toThrow(RangeError);
    expect(() => nyWallTimeToUtc("2026-11-05", "9:00")).toThrow(RangeError);
  });
});
