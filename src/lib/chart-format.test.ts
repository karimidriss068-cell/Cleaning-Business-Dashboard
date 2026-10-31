import { describe, expect, it } from "vitest";
import { formatChartValue } from "./chart-format";

describe("formatChartValue", () => {
  it("formats cents for axes and tooltips", () => {
    expect(formatChartValue(0, "dollars-short")).toBe("$0");
    expect(formatChartValue(85000, "dollars-short")).toBe("$850");
    expect(formatChartValue(120000, "dollars-short")).toBe("$1.2k");
    expect(formatChartValue(123456, "dollars")).toBe("$1,235");
  });
  it("formats counts", () => expect(formatChartValue(1234, "count")).toBe("1,234"));
});
