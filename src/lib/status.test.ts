import { describe, expect, it } from "vitest";
import {
  budgetLabel,
  budgetTone,
  capacityLabel,
  capacityTone,
  cashLabel,
  cashTone,
  coiTone,
  conditionLabel,
  conditionTone,
  invoiceLabel,
  invoiceTone,
  jobTone,
  leadTone,
  paceLabel,
  paceTone,
  payoutTone,
  scaleLabel,
  scaleTone,
} from "./status";

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

  it("maps growth pace, capacity, budget, cash and the scale light to tones with words", () => {
    expect(paceTone.ahead).toBe("success");
    expect(paceTone.behind).toBe("warning");
    expect(paceLabel.on_track).toBe("On track");
    expect(scaleTone).toEqual({ green: "success", amber: "warning", red: "danger" });
    expect(scaleLabel.red).toMatch(/^Red/);
    expect(conditionTone.unknown).toBe("neutral");
    expect(conditionLabel.fail).toBe("Blocking");
    expect(capacityTone.warn).toBe("warning");
    expect(budgetTone.over).toBe("danger");
    expect(cashTone.negative).toBe("danger");
    expect(cashLabel.low).toMatch(/buffer/);
    expect(capacityLabel.over).toBe("Over capacity");
    expect(budgetLabel.near).toBe("Close to budget");
  });
});
