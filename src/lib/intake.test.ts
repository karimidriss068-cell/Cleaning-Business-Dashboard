import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, intakeSchema, replyExpectation, splitName } from "@/lib/intake";

const valid = { name: "Maria Del Rio", phone: "(332) 555-0101", email: "maria@example.com", borough: "queens", serviceType: "commercial", consent: true, consentVersion: CONSENT_VERSION };

describe("intakeSchema", () => {
  it("accepts a normal submission", () => {
    expect(intakeSchema.safeParse(valid).success).toBe(true);
  });
  it("needs a phone or an email", () => {
    const r = intakeSchema.safeParse({ ...valid, phone: undefined, email: undefined, consent: false });
    expect(r.success).toBe(false);
  });
  it("accepts email only when there is no text consent", () => {
    expect(intakeSchema.safeParse({ ...valid, phone: undefined, consent: false }).success).toBe(true);
  });
  it("refuses text consent without a phone", () => {
    const r = intakeSchema.safeParse({ ...valid, phone: undefined });
    expect(r.success).toBe(false);
  });
  it.each([["123"], ["abcdefghij"], ["+44 20 7946 0958"]])("refuses the phone %s", (phone) => {
    expect(intakeSchema.safeParse({ ...valid, phone }).success).toBe(false);
  });
  it("refuses a bad email, an unknown borough and an unknown service", () => {
    expect(intakeSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, borough: "mars" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, serviceType: "window_washing" }).success).toBe(false);
    // Residential work is hidden in the app, so the public form refuses it too.
    expect(intakeSchema.safeParse({ ...valid, serviceType: "residential" }).success).toBe(false);
  });
  it("refuses a link as a name and a blank name", () => {
    expect(intakeSchema.safeParse({ ...valid, name: "visit http://spam.example" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });
  it("refuses fields it does not know about", () => {
    expect(intakeSchema.safeParse({ ...valid, source: "referral" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, utm: { source: "x", admin: "1" } }).success).toBe(false);
  });
  it("strips control characters from tracking tags and caps their length", () => {
    const r = intakeSchema.parse({ ...valid, utm: { campaign: " spring\u0000\n " } });
    expect(r.utm.campaign).toBe("spring");
    expect(intakeSchema.safeParse({ ...valid, utm: { campaign: "x".repeat(201) } }).success).toBe(false);
  });
  it("needs a web address for the page", () => {
    expect(intakeSchema.safeParse({ ...valid, page: "javascript:alert(1)" }).success).toBe(false);
    expect(intakeSchema.safeParse({ ...valid, page: "https://example.com/clean" }).success).toBe(true);
  });
});

describe("splitName", () => {
  it("splits on the first space", () => {
    expect(splitName("Maria Del Rio")).toEqual({ first: "Maria", last: "Del Rio" });
    expect(splitName("  Cher ")).toEqual({ first: "Cher", last: null });
  });
});

describe("replyExpectation", () => {
  it("promises a quick reply while the office is open (New York time)", () => {
    // 15:00 UTC is 11:00 in New York in November (EST) and 11:00 in July (EDT).
    expect(replyExpectation(new Date("2026-11-04T16:00:00Z")).kind).toBe("now");
    expect(replyExpectation(new Date("2026-07-14T15:00:00Z")).kind).toBe("now");
  });
  it("promises the morning after hours", () => {
    const night = replyExpectation(new Date("2026-11-05T03:00:00Z")); // 10pm EST
    expect(night.kind).toBe("morning");
    expect(night.message).toContain("tomorrow");
    const early = replyExpectation(new Date("2026-11-04T10:00:00Z")); // 5am EST
    expect(early.message).toContain("this morning");
  });
  it("uses the New York hour at the 8am and 9pm edges", () => {
    expect(replyExpectation(new Date("2026-11-04T13:00:00Z")).kind).toBe("now"); // 8:00 EST
    expect(replyExpectation(new Date("2026-11-04T12:59:00Z")).kind).toBe("morning"); // 7:59 EST
    expect(replyExpectation(new Date("2026-11-05T01:59:00Z")).kind).toBe("now"); // 8:59pm EST
    expect(replyExpectation(new Date("2026-11-05T02:00:00Z")).kind).toBe("morning"); // 9:00pm EST
  });
});
