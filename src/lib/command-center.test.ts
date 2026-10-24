import { describe, expect, it } from "vitest";
import { cumulative, dailySeries, dayRange, median, shortDuration, signedCount, signedPercent } from "./command-center";

describe("command center helpers", () => {
  it("builds an inclusive NY day range", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("buckets instants by New York day, not UTC", () => {
    const days = ["2026-11-03", "2026-11-04"];
    const items = [
      { at: "2026-11-04T03:30:00Z", cents: 100 }, // 10:30 PM Nov 3 in NY
      { at: "2026-11-04T14:00:00Z", cents: 250 },
      { at: "2026-11-05T06:00:00Z", cents: 999 }, // Nov 5 in NY: outside the range
    ];
    expect(dailySeries(items, (i) => i.at, days)).toEqual([1, 1]);
    expect(dailySeries(items, (i) => i.at, days, (i) => i.cents)).toEqual([100, 250]);
  });

  it("accumulates and takes medians", () => {
    expect(cumulative([1, 2, 0, 3])).toEqual([1, 3, 3, 6]);
    expect(median([5, 1, 9])).toBe(5);
    expect(median([4, 1, 9, 2])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("formats signed changes with a true minus sign", () => {
    expect(signedCount(3)).toBe("+3");
    expect(signedCount(-2)).toBe("−2");
    expect(signedCount(0)).toBe("±0");
    expect(signedPercent(100, 112)).toBe("+12%");
    expect(signedPercent(100, 90)).toBe("−10%");
    expect(signedPercent(0, 5)).toBeNull();
  });

  it("formats short durations", () => {
    expect(shortDuration(9)).toBe("9m");
    expect(shortDuration(125)).toBe("2h 5m");
    expect(shortDuration(120)).toBe("2h");
    expect(shortDuration(60 * 24 * 3 + 5)).toBe("3d");
  });
});
