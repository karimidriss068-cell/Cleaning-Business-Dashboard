import { describe, expect, it } from "vitest";
import { createLeadSchema, mapLeadError, moveLeadSchema, parseDuplicates } from "./leads";

const base = { firstName: "Dana", serviceType: "residential", source: "google", phone: "(718) 555-0142" } as const;

describe("createLeadSchema", () => {
  it("accepts a phone-only lead and drops blank optional fields", () => {
    const r = createLeadSchema.parse({ ...base, email: "", borough: "", zip: "", notes: " " });
    expect(r.email).toBeUndefined();
    expect(r.borough).toBeUndefined();
    expect(r.allowDuplicate).toBe(false);
  });
  it("needs a phone or an email", () => expect(createLeadSchema.safeParse({ ...base, phone: "" }).success).toBe(false));
  it("rejects bad phone, source and ZIP", () => {
    expect(createLeadSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, source: "tiktok" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, zip: "1121" }).success).toBe(false);
  });
});

describe("moveLeadSchema", () => {
  const ok = { leadId: "5eed0000-0000-4000-8000-000000000001", expectedUpdatedAt: "2026-11-01T12:00:00+00:00", stage: "lost" };
  it("parses a move", () => expect(moveLeadSchema.safeParse({ ...ok, lostReason: "Too expensive" }).success).toBe(true));
  it("rejects a vague lost reason", () => expect(moveLeadSchema.safeParse({ ...ok, lostReason: "x" }).success).toBe(false));
});

describe("mapLeadError", () => {
  it("maps stale, duplicate and forbidden", () => {
    expect(mapLeadError({ code: "KC001" }).code).toBe("stale");
    expect(mapLeadError({ code: "42501" }).code).toBe("forbidden");
    const d = mapLeadError({ code: "KC010", details: JSON.stringify([{ contact_id: "c1", name: "Dana Reyes", phone: "+17185550142", email: null, matched: ["phone"], open_lead_id: null, open_lead_stage: null }]) });
    expect(d.code).toBe("duplicate");
    expect(d.duplicates?.[0]).toMatchObject({ contactId: "c1", matched: ["phone"] });
  });
  it("survives unparseable details", () => expect(parseDuplicates("nope")).toEqual([]));
});
