import { describe, expect, it } from "vitest";
import { formatFigure } from "./animated-number";

describe("formatFigure", () => {
  it("formats integer cents as dollars", () => {
    expect(formatFigure(123456, "cents")).toBe("$1,234.56");
    expect(formatFigure(123400, "cents", { hideZeroCents: true })).toBe("$1,234");
    expect(formatFigure(0, "cents")).toBe("$0.00");
  });
  it("rounds in-between frames to whole cents so no float ever shows", () => {
    expect(formatFigure(12345.6, "cents")).toBe("$123.46");
  });
  it("formats percents and counts", () => {
    expect(formatFigure(41.6, "percent")).toBe("42%");
    expect(formatFigure(12345, "count")).toBe("12,345");
  });
});
