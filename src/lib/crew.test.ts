import { describe, expect, it } from "vitest";
import { addressLine, checklistLabel, completeOpensAt, completeState, groupVisits, insuranceReminder, mapsUrl, payLabel, photoPath, validatePhotoFile } from "./crew";
import { completeVisitSchema, crewVisitSchema, mapCompleteError, registerPhotoSchema } from "./schemas/crew";

const JOB = "5eed0000-0010-4000-8000-000000000001";

describe("complete rule (mirrors complete_job)", () => {
  const start = "2026-10-27T13:00:00Z"; // 9:00 AM EDT
  it("opens one hour before the start", () => {
    expect(completeOpensAt(start).toISOString()).toBe("2026-10-27T12:00:00.000Z");
  });
  it("is too early before, open from then on, and done or closed by status", () => {
    expect(completeState(new Date("2026-10-27T11:59:00Z"), start, "scheduled")).toMatchObject({ kind: "too_early", label: "8:00 AM" });
    expect(completeState(new Date("2026-10-27T12:00:00Z"), start, "scheduled").kind).toBe("open");
    expect(completeState(new Date("2026-10-27T20:00:00Z"), start, "in_progress").kind).toBe("open");
    expect(completeState(new Date("2026-10-27T13:00:00Z"), start, "completed").kind).toBe("done");
    expect(completeState(new Date("2026-10-27T13:00:00Z"), start, "no_access").kind).toBe("closed");
  });
  it("labels the opening time with its date when it's not today (New York)", () => {
    const s = completeState(new Date("2026-10-25T20:00:00Z"), start, "scheduled");
    expect(s).toMatchObject({ kind: "too_early", label: "Tue, Oct 27, 8:00 AM" });
  });
});

describe("maps, pay and labels", () => {
  it("writes the full address with its city", () => {
    expect(addressLine({ address_line1: "138 Court St", address_line2: "Suite 600", borough: "brooklyn", zip: "11222" })).toBe("138 Court St, Suite 600, Brooklyn 11222");
    expect(addressLine({ address_line1: "1 W 86th St", address_line2: null, borough: "manhattan", zip: "10024" })).toBe("1 W 86th St, New York 10024");
  });
  it("builds a maps URL with the borough's city and zip", () => {
    const url = mapsUrl({ address_line1: "410 5th Ave", borough: "brooklyn", zip: "11215" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=410%205th%20Ave%2C%20Brooklyn%2C%20NY%2011215");
    expect(mapsUrl({ address_line1: "1 W 86th St", borough: "manhattan", zip: "10024" })).toContain("New%20York");
  });
  it("formats pay, including hourly pay that isn't known yet", () => {
    expect(payLabel(8000, false)).toBe("$80.00");
    expect(payLabel(null, true)).toBe("Pay set after the visit");
  });
  it("labels checklist progress", () => {
    expect(checklistLabel(2, 6)).toBe("2 of 6 tasks");
    expect(checklistLabel(0, 0)).toBe("No checklist");
  });
});

describe("grouping by New York day", () => {
  it("separates today from the days after, in order, using NY dates not UTC", () => {
    const v = (id: string, start: string) => ({ id, scheduled_start: start });
    const g = groupVisits([v("late", "2026-10-28T02:30:00Z"), v("next", "2026-10-28T14:00:00Z"), v("today", "2026-10-27T13:00:00Z"), v("later", "2026-10-30T14:00:00Z")], "2026-10-27");
    expect(g.today.map((x) => x.id)).toEqual(["today", "late"]); // 10:30 PM on Oct 27 in New York is still today
    expect(g.upcoming.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-30"]);
    expect(g.upcoming[0].visits.map((x) => x.id)).toEqual(["next"]);
  });
});

describe("insurance reminder", () => {
  const today = "2026-10-27";
  it("is silent when more than 30 days remain", () => {
    expect(insuranceReminder("2026-12-31", today)).toBeNull();
  });
  it("warns within 30 days, and on the day", () => {
    expect(insuranceReminder("2026-11-10", today)).toMatchObject({ tone: "warning", title: "Your insurance certificate expires in 14 days" });
    expect(insuranceReminder("2026-10-27", today)?.title).toBe("Your insurance certificate expires today");
    expect(insuranceReminder("2026-10-28", today)?.title).toBe("Your insurance certificate expires in 1 day");
  });
  it("is a danger once expired, and nags if there's none on file", () => {
    expect(insuranceReminder("2026-10-26", today)).toMatchObject({ tone: "danger" });
    expect(insuranceReminder(null, today)).toMatchObject({ tone: "warning", title: "No insurance certificate on file" });
  });
});

describe("photo validation (mirrors the bucket)", () => {
  it("accepts image types up to 10 MB", () => {
    expect(validatePhotoFile({ type: "image/jpeg", size: 3_000_000 })).toBeNull();
    expect(validatePhotoFile({ type: "image/heic", size: 10 * 1024 * 1024 })).toBeNull();
  });
  it("rejects other types, oversized and empty files with clear messages", () => {
    expect(validatePhotoFile({ type: "application/pdf", size: 1000 })).toMatch(/isn't a photo/);
    expect(validatePhotoFile({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).toMatch(/too large/);
    expect(validatePhotoFile({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
  it("builds the storage path inside the visit's folder", () => {
    expect(photoPath(JOB, "abc-123", "image/webp")).toBe(`${JOB}/abc-123.webp`);
  });
});

describe("crew schemas", () => {
  it("only accepts photo paths inside the visit's own folder", () => {
    const base = { jobId: JOB, kind: "before", contentType: "image/jpeg" };
    expect(registerPhotoSchema.safeParse({ ...base, path: `${JOB}/a1b2.jpg` }).success).toBe(true);
    expect(registerPhotoSchema.safeParse({ ...base, path: `5eed0000-0010-4000-8000-000000000002/a1b2.jpg` }).success).toBe(false);
    expect(registerPhotoSchema.safeParse({ ...base, path: `${JOB}/../x.jpg` }).success).toBe(false);
    expect(registerPhotoSchema.safeParse({ ...base, path: `${JOB}/a.exe` }).success).toBe(false);
    expect(registerPhotoSchema.safeParse({ ...base, contentType: "application/pdf", path: `${JOB}/a.jpg` }).success).toBe(false);
  });
  it("validates ids and maps complete_job errors without leaking internals", () => {
    expect(completeVisitSchema.safeParse({ jobId: "nope" }).success).toBe(false);
    expect(mapCompleteError({ message: "job can't be completed more than 1 hour before its scheduled start" })).toMatchObject({ code: "too_early" });
    expect(mapCompleteError({ code: "42501", message: "job not assigned to you" })).toMatchObject({ code: "forbidden" });
    expect(mapCompleteError({ message: "relation \"secret\" does not exist" })).toEqual({ ok: false, code: "error", message: "Couldn't complete the visit. Try again." });
  });
  it("parses a visit row and rejects extra billing-looking data being required", () => {
    const row = { job_id: JOB, scheduled_start: "x", scheduled_end: "y", status: "scheduled", service_name: "Standard", client_name: "Maria", address_line1: "1 Main", address_line2: null, borough: "brooklyn", zip: "11215", access_instructions: null, crew_notes: null, my_pay_cents: 8000, pay_pending: false, teammates: [], checklist_done: 0, checklist_total: 3, photo_count: 0 };
    expect(crewVisitSchema.safeParse(row).success).toBe(true);
    expect(Object.keys(crewVisitSchema.shape)).not.toEqual(expect.arrayContaining(["price_cents", "phone", "email", "invoice_id"]));
  });
});
