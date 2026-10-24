import { describe, expect, it } from "vitest";
import { coiTone, invoiceLabel, invoiceTone, jobTone, leadTone, payoutTone } from "./status";

describe("status tones", () => {
  it("maps job, lead and payout statuses per DESIGN.md", () => {
    expect(jobTone("completed")).toBe("success");
    expect(jobTone("no_access")).toBe("warning");
    expect(jobTone("cancelled")).toBe("neutral");
    expect(leadTone("quoted")).toBe("sand");
    expect(leadTone("won")).toBe("success");
    expect(payoutTone("approved")).toBe("info");
  });

  it("derives overdue from an open invoice past its NY due date", () => {
    expect(invoiceTone("open", "2026-10-22", "2026-10-23")).toBe("danger");
    expect(invoiceLabel("open", "2026-10-22", "2026-10-23")).toBe("Overdue");
    expect(invoiceTone("open", "2026-10-23", "2026-10-23")).toBe("info"); // due today isn't overdue
    expect(invoiceTone("paid", "2026-01-01", "2026-10-23")).toBe("success");
    expect(invoiceTone("open", null, "2026-10-23")).toBe("info");
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
