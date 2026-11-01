import { describe, expect, it } from "vitest";
import {
  build1099Csv,
  centsToDecimal,
  classify1099,
  csvCell,
  marginBps,
  payoutWeekStart,
  reasonLabel,
  recentWeekStarts,
  remainingToThresholdCents,
  totals1099,
  type Row1099,
} from "./payouts";

describe("1099 threshold", () => {
  const T = 200000; // $2,000 (a setting; confirm the current figure with your accountant)
  it("is ok below the warning share, approaching from it, over at the threshold", () => {
    expect(classify1099(0, T, 8000)).toBe("ok");
    expect(classify1099(159999, T, 8000)).toBe("ok");
    expect(classify1099(160000, T, 8000)).toBe("approaching"); // 80% exactly
    expect(classify1099(199999, T, 8000)).toBe("approaching");
    expect(classify1099(200000, T, 8000)).toBe("over");
    expect(classify1099(350000, T, 8000)).toBe("over");
  });
  it("follows the setting: a $600 threshold flags earlier, 0 turns it off", () => {
    expect(classify1099(60000, 60000, 8000)).toBe("over");
    expect(classify1099(48000, 60000, 8000)).toBe("approaching");
    expect(classify1099(999999, 0, 8000)).toBe("ok");
  });
  it("uses integer math only", () => {
    expect(() => classify1099(1.5, T, 8000)).toThrow(RangeError);
    expect(() => classify1099(-1, T, 8000)).toThrow(RangeError);
  });
  it("reports what remains before the threshold", () => {
    expect(remainingToThresholdCents(150000, T)).toBe(50000);
    expect(remainingToThresholdCents(250000, T)).toBe(0);
  });
});

describe("1099 year totals", () => {
  const rows: Row1099[] = [
    { displayName: "Ana Ruiz", legalName: "Ana Ruiz", businessEntity: "individual", w9OnFile: true, paidCents: 250000, approvedCents: 0 },
    { displayName: "Luis F.", legalName: null, businessEntity: "llc", w9OnFile: false, paidCents: 170000, approvedCents: 10000 },
    { displayName: "Sam", legalName: null, businessEntity: "individual", w9OnFile: false, paidCents: 0, approvedCents: 0 },
    { displayName: "Kim", legalName: null, businessEntity: "individual", w9OnFile: false, paidCents: 0, approvedCents: 5000 },
  ];
  it("adds up paid money and counts who needs attention", () => {
    expect(totals1099(rows, 200000, 8000)).toEqual({ paidCents: 420000, over: 1, approaching: 1, missingW9: 2 });
  });
  it("ignores a missing W-9 for someone who hasn't been paid or approved yet", () => {
    expect(totals1099([rows[2]], 200000, 8000).missingW9).toBe(0);
  });
});

describe("CSV for the accountant", () => {
  it("writes plain decimals from integer cents", () => {
    expect(centsToDecimal(123456)).toBe("1234.56");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(-250)).toBe("-2.50");
    expect(() => centsToDecimal(1.5)).toThrow(RangeError);
  });
  it("quotes fields and doubles inner quotes", () => {
    expect(csvCell('Ana "AJ" Ruiz')).toBe('"Ana ""AJ"" Ruiz"');
    expect(csvCell("Ruiz, Ana")).toBe('"Ruiz, Ana"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(2026)).toBe("2026");
  });
  it("defuses spreadsheet formulas in names", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\",\"x\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\",\"\"x\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5"); // real numbers are untouched
  });
  it("builds one header row and one row per subcontractor", () => {
    const csv = build1099Csv({
      year: 2026,
      thresholdCents: 200000,
      warnBps: 8000,
      rows: [{ displayName: "Ana Ruiz", legalName: "Ana M. Ruiz", businessEntity: "individual", w9OnFile: true, paidCents: 250000, approvedCents: 12000 }],
    });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("2026,Ana Ruiz,Ana M. Ruiz,individual,Yes,2500.00,120.00,2000.00,Over threshold: report");
  });
});

describe("weeks and reasons", () => {
  it("starts weeks on Monday in New York", () => {
    expect(payoutWeekStart("2026-11-01")).toBe("2026-10-26"); // a Sunday belongs to the week before
    expect(payoutWeekStart("2026-11-02")).toBe("2026-11-02");
    expect(recentWeekStarts("2026-11-01", 3)).toEqual(["2026-10-26", "2026-10-19", "2026-10-12"]);
  });
  it("explains each exclusion in plain words", () => {
    expect(reasonLabel("invoice_unpaid", { invoiceNumber: 42, balanceCents: 30000 })).toBe("Invoice #42 is unpaid ($300.00 due)");
    expect(reasonLabel("invoice_partial", { invoiceNumber: 7, balanceCents: 20775 })).toBe("Invoice #7 is only partly paid ($207.75 due)");
    expect(reasonLabel("no_invoice")).toBe("No invoice yet. Invoice it first");
    expect(reasonLabel("invoice_draft", { invoiceNumber: 9 })).toBe("Invoice #9 hasn't been sent");
    expect(reasonLabel("pay_pending")).toMatch(/hours not entered/);
    expect(reasonLabel("mystery")).toBe("Not eligible");
  });
});

describe("finance margin", () => {
  it("is a share of collected money in basis points", () => {
    expect(marginBps(45775, 65775)).toBe(6959);
    expect(marginBps(0, 0)).toBeNull();
    expect(marginBps(-1000, 10000)).toBe(-1000);
  });
});

import { monthShort } from "./payouts";
describe("month labels", () => {
  it("names a calendar month without a time zone", () => {
    expect(monthShort("2026-11-01")).toBe("Nov");
    expect(monthShort("2026-01-01")).toBe("Jan");
  });
});
