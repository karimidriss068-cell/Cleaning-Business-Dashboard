import { describe, expect, it } from "vitest";
import { ghlContactSchema, notificationSchema, parseSentAt, unwrap, withinReplayWindow, ghlOpportunitySchema } from "./schemas";

describe("notification contract", () => {
  const base = { event: "message", eventId: "evt-12345678", sentAt: "2026-11-04T15:00:00Z", messageId: "m1" };
  it("accepts each event with its id", () => {
    expect(notificationSchema.safeParse(base).success).toBe(true);
    expect(notificationSchema.safeParse({ event: "contact", eventId: "evt-12345678", sentAt: 1, contactId: "c" }).success).toBe(true);
    expect(notificationSchema.safeParse({ event: "opportunity", eventId: "evt-12345678", sentAt: 1, opportunityId: "o" }).success).toBe(true);
    expect(notificationSchema.safeParse({ event: "appointment", eventId: "evt-12345678", sentAt: 1, appointmentId: "a" }).success).toBe(true);
  });
  it("rejects a missing id for the event, a short event id and an unknown event", () => {
    expect(notificationSchema.safeParse({ ...base, messageId: undefined }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...base, eventId: "x" }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...base, event: "delete_everything" }).success).toBe(false);
    expect(notificationSchema.safeParse({ ...base, sentAt: undefined }).success).toBe(false);
  });
});

describe("replay window", () => {
  const now = new Date("2026-11-04T15:00:00Z");
  it("reads ISO text, epoch seconds and epoch milliseconds", () => {
    expect(parseSentAt("2026-11-04T15:00:00Z")?.toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(parseSentAt(1793804400)?.toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(parseSentAt("1793804400000")?.toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(parseSentAt("not a date")).toBeNull();
  });
  it("accepts within five minutes either way and rejects outside", () => {
    expect(withinReplayWindow(new Date("2026-11-04T14:55:01Z"), now)).toBe(true);
    expect(withinReplayWindow(new Date("2026-11-04T15:04:59Z"), now)).toBe(true);
    expect(withinReplayWindow(new Date("2026-11-04T14:54:59Z"), now)).toBe(false);
    expect(withinReplayWindow(new Date("2026-11-04T15:05:01Z"), now)).toBe(false);
  });
});

describe("GHL records", () => {
  it("reads a contact leniently and defaults the lists", () => {
    const c = ghlContactSchema.parse({ id: "c1", firstName: "Dana", phone: "+17185550142", extra: { anything: 1 } });
    expect(c.tags).toEqual([]);
    expect(c.dnd).toBe(false);
    expect(c.attributions).toEqual([]);
    expect(c.email).toBeNull();
  });
  it("unwraps a bare or wrapped record and returns null for junk", () => {
    expect(unwrap(ghlOpportunitySchema, "opportunity", { opportunity: { id: "o1", status: "open" } })?.id).toBe("o1");
    expect(unwrap(ghlOpportunitySchema, "opportunity", { id: "o2" })?.id).toBe("o2");
    expect(unwrap(ghlOpportunitySchema, "opportunity", { nope: true })).toBeNull();
  });
});
