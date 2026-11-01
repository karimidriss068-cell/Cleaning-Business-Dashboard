import { describe, expect, it } from "vitest";
import { decideSend, isQuietHours, isStopKeyword, nextSendTime, renderTemplate, templateVars } from "./send-rules";

// 2026-07-15 is EDT (UTC-4); 2026-12-15 is EST (UTC-5).
const at = (iso: string) => new Date(iso);

describe("quiet hours (8am to 9pm New York)", () => {
  it("allows 8:00 up to 20:59 and blocks 21:00 up to 7:59", () => {
    expect(isQuietHours(at("2026-07-15T11:59:00Z"))).toBe(true); // 7:59 EDT
    expect(isQuietHours(at("2026-07-15T12:00:00Z"))).toBe(false); // 8:00 EDT
    expect(isQuietHours(at("2026-07-16T00:59:00Z"))).toBe(false); // 20:59 EDT
    expect(isQuietHours(at("2026-07-16T01:00:00Z"))).toBe(true); // 21:00 EDT
  });
  it("follows New York in winter, not UTC", () => {
    expect(isQuietHours(at("2026-12-15T12:59:00Z"))).toBe(true); // 7:59 EST
    expect(isQuietHours(at("2026-12-15T13:00:00Z"))).toBe(false); // 8:00 EST
    expect(isQuietHours(at("2026-12-16T01:59:00Z"))).toBe(false); // 20:59 EST
    expect(isQuietHours(at("2026-12-16T02:00:00Z"))).toBe(true); // 21:00 EST
  });
  it("is right on the daylight-saving change days", () => {
    // Spring forward 2026-03-08: 2:00 EST becomes 3:00 EDT. 8:00 EDT = 12:00Z.
    expect(isQuietHours(at("2026-03-08T11:59:00Z"))).toBe(true);
    expect(isQuietHours(at("2026-03-08T12:00:00Z"))).toBe(false);
    // Fall back 2026-11-01: 8:00 EST = 13:00Z.
    expect(isQuietHours(at("2026-11-01T12:59:00Z"))).toBe(true);
    expect(isQuietHours(at("2026-11-01T13:00:00Z"))).toBe(false);
  });
});

describe("nextSendTime", () => {
  it("is now during the day", () => {
    const now = at("2026-07-15T18:00:00Z");
    expect(nextSendTime(now)).toEqual(now);
  });
  it("is 8:00 the same morning before 8", () => {
    expect(nextSendTime(at("2026-07-15T09:00:00Z")).toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });
  it("is 8:00 the next morning after 9pm", () => {
    expect(nextSendTime(at("2026-07-16T02:30:00Z")).toISOString()).toBe("2026-07-16T12:00:00.000Z");
    expect(nextSendTime(at("2026-12-16T03:00:00Z")).toISOString()).toBe("2026-12-16T13:00:00.000Z");
  });
  it("crosses the fall-back night correctly", () => {
    // 11pm on Oct 31 (EDT) -> 8:00 EST on Nov 1 = 13:00Z.
    expect(nextSendTime(at("2026-11-01T03:00:00Z")).toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });
});

describe("decideSend", () => {
  const limits = { perContactPerDay: 3, perHour: 30 };
  const day = at("2026-07-15T18:00:00Z");
  it("sends in the day under the limits", () => {
    expect(decideSend(day, { contactDay: 2, hour: 29 }, limits)).toEqual({ action: "send" });
  });
  it("waits in quiet hours, until the next 8am", () => {
    const d = decideSend(at("2026-07-16T02:00:00Z"), { contactDay: 0, hour: 0 }, limits);
    expect(d).toMatchObject({ action: "wait", reason: "quiet_hours" });
    expect(d.action === "wait" && d.until?.toISOString()).toBe("2026-07-16T12:00:00.000Z");
  });
  it("waits at the per-contact daily limit and at the hourly limit", () => {
    expect(decideSend(day, { contactDay: 3, hour: 0 }, limits)).toMatchObject({ action: "wait", reason: "rate_limit" });
    expect(decideSend(day, { contactDay: 0, hour: 30 }, limits)).toMatchObject({ action: "wait", reason: "rate_limit" });
  });
  it("checks quiet hours before the rate limit", () => {
    expect(decideSend(at("2026-07-16T02:00:00Z"), { contactDay: 9, hour: 99 }, limits)).toMatchObject({ reason: "quiet_hours" });
  });
});

describe("STOP keywords", () => {
  it("matches the whole message, ignoring case and punctuation", () => {
    for (const w of ["STOP", " stop. ", "Stop!", "UNSUBSCRIBE", "stop all", "Opt-out", "cancel", "END", "Quit"]) expect(isStopKeyword(w)).toBe(true);
  });
  it("does not match a sentence that contains the word", () => {
    for (const w of ["please don't stop", "Stop by at 3", "ok", "", "starter"]) expect(isStopKeyword(w)).toBe(false);
  });
});

describe("templates", () => {
  it("fills placeholders and drops unknown ones", () => {
    expect(renderTemplate("Hi {{first_name}}, {{business}} {{nope}} {{ when }}!", { first_name: "Dana", business: "Keystone Clean", when: "Friday" })).toBe("Hi Dana, Keystone Clean Friday!");
  });
  it("formats the visit time in New York and falls back to 'there'", () => {
    const v = templateVars({ firstName: "", business: "Keystone Clean", eventAt: at("2026-07-17T14:00:00Z"), payLink: null });
    expect(v.first_name).toBe("there");
    expect(v.when).toBe("Friday, Jul 17, 10:00 AM");
    expect(v.pay_link).toBe("");
  });
});
