import { describe, expect, it } from "vitest";
import { coiTone, invoiceLabel, invoiceTone, jobTone, leadTone, payoutTone } from "./status";

describe("status tones", () => {
  it("maps job, lead and payout statuses per DESIGN.md", () => {
    expect(jobTone("completed")).toBe("success");
    expect(jobTone("no_access")).toBe("warning");
    expect(jobTone("cancelled")).toBe("neutral");
    expect(leadTone("quoted")).toBe("secondary");
    expect(leadTone("won")).toBe("success");
    expect(payoutTone("approved")).toBe("info");
  });

  it("derives overdue from a sent invoice past its NY due date", () => {
    expect(invoiceTone("sent", "2026-10-22", "2026-10-23")).toBe("danger");
    expect(invoiceLabel("sent", "2026-10-22", "2026-10-23")).toBe("Overdue");
    expect(invoiceLabel("partially_paid", "2026-10-22", "2026-10-23")).toBe("Overdue");
    expect(invoiceTone("sent", "2026-10-23", "2026-10-23")).toBe("info"); // due today isn't overdue
    expect(invoiceTone("paid", "2026-01-01", "2026-10-23")).toBe("success");
    expect(invoiceTone("sent", null, "2026-10-23")).toBe("info");
    expect(invoiceLabel("partially_paid", "2026-11-01", "2026-10-23")).toBe("Partially paid");
    expect(invoiceTone("void", "2026-01-01", "2026-10-23")).toBe("neutral");
    expect(invoiceLabel("draft", null, "2026-10-23")).toBe("Draft");
  });

  it("flags insurance as expired, expiring within 30 days, or valid", () => {
    const today = "2026-10-23";
    const in30 = "2026-11-22";
    expect(coiTone("2026-10-20", today, in30)).toBe("danger");
    expect(coiTone("2026-11-10", today, in30)).toBe("warning");
    expect(coiTone("2026-11-22", today, in30)).toBe("warning");
    expect(coiTone("2027-03-01", today, in30)).toBe("success");
    expect(coiTone(null, today, in30)).toBe("neutral");
  });
});
