import { describe, expect, it } from "vitest";
import { applyProposal, conflictsFor, defaultPeopleForCrew, planDrop, startOnDate, type Roster } from "./dispatch-move";
import { UNASSIGNED_LANE, type BoardVisit } from "./schedule-lanes";

const roster: Roster = new Map([
  ["ana", { id: "ana", name: "Ana Ruiz", status: "active", coiExpiresOn: "2027-06-01", boroughs: ["brooklyn", "queens"] }],
  ["luis", { id: "luis", name: "Luis F", status: "active", coiExpiresOn: "2027-06-01", boroughs: ["manhattan"] }],
  ["mei", { id: "mei", name: "Mei Lin", status: "active", coiExpiresOn: "2026-10-01", boroughs: ["queens"] }],
  ["old", { id: "old", name: "Old Timer", status: "inactive", coiExpiresOn: null, boroughs: [] }],
]);
const crewMembers = [
  { crewId: "A", subcontractorId: "ana" }, { crewId: "A", subcontractorId: "old" },
  { crewId: "B", subcontractorId: "luis" }, { crewId: "B", subcontractorId: "mei" },
];
const crews = [{ id: "A", name: "Crew A" }, { id: "B", name: "Crew B" }];
const visit = (id: string, over: Partial<BoardVisit> = {}): BoardVisit => ({
  id, updatedAt: "2026-10-25T00:00:00Z", start: "2026-10-27T13:00:00Z", end: "2026-10-27T15:00:00Z", status: "scheduled",
  clientName: "Client", serviceName: "Standard", borough: "brooklyn", priceCents: 10000, crewId: "A", crewName: "Crew A", people: [{ id: "ana", name: "Ana Ruiz" }], ...over,
});
const plan = (over: Partial<Parameters<typeof planDrop>[0]> = {}) =>
  planDrop({ visit: visit("v1"), mode: "crew", fromLaneId: "A", toLaneId: "A", newStart: new Date("2026-10-27T13:00:00Z"), newEnd: new Date("2026-10-27T15:00:00Z"), crewMembers, roster, visits: [visit("v1")], ...over });

describe("planDrop", () => {
  it("does nothing when dropped back where it was", () => {
    expect(plan().kind).toBe("none");
  });

  it("applies a conflict-free time move immediately", () => {
    const p = plan({ newStart: new Date("2026-10-27T16:00:00Z"), newEnd: new Date("2026-10-27T18:00:00Z") });
    expect(p.kind).toBe("apply");
    expect(p.proposal.personIds).toEqual(["ana"]);
  });

  it("opens the sheet for a crew change, defaulting to that crew's active members", () => {
    const p = plan({ toLaneId: "B" });
    expect(p.kind).toBe("sheet");
    expect(p.proposal.crewId).toBe("B");
    expect(p.proposal.personIds).toEqual(["luis", "mei"]);
    expect(defaultPeopleForCrew("A", crewMembers, roster)).toEqual(["ana"]); // inactive member excluded
  });

  it("unassigning from the Unassigned lane clears crew and cleaners", () => {
    const p = plan({ toLaneId: UNASSIGNED_LANE });
    expect(p).toMatchObject({ kind: "sheet", proposal: { crewId: null, personIds: [] } });
  });

  it("person mode: replaces the dragged-from cleaner, or adds from Unassigned", () => {
    expect(plan({ mode: "person", fromLaneId: "ana", toLaneId: "luis" }).proposal.personIds).toEqual(["luis"]);
    const un = visit("v2", { people: [], crewId: null, crewName: null });
    expect(plan({ visit: un, visits: [un], mode: "person", fromLaneId: UNASSIGNED_LANE, toLaneId: "luis" }).proposal.personIds).toEqual(["luis"]);
  });

  it("opens the sheet on a time-only move that double-books someone", () => {
    const other = visit("v2", { start: "2026-10-27T16:00:00Z", end: "2026-10-27T18:00:00Z" });
    const p = plan({ visits: [visit("v1"), other], newStart: new Date("2026-10-27T17:00:00Z"), newEnd: new Date("2026-10-27T19:00:00Z") });
    expect(p.kind).toBe("sheet");
    expect(p.conflicts.map((c) => c.kind)).toContain("double_booked");
  });
});

describe("conflicts, optimistic result and week drops", () => {
  it("flags expired insurance for a proposed cleaner", () => {
    const c = conflictsFor(visit("v1"), { crewId: "B", personIds: ["mei"], start: new Date("2026-10-27T13:00:00Z"), end: new Date("2026-10-27T15:00:00Z") }, [visit("v1")], roster);
    expect(c.map((x) => `${x.severity}:${x.kind}`)).toContain("block:insurance_expired");
  });

  it("builds the optimistic visit with the new crew name and cleaners", () => {
    const v = applyProposal(visit("v1"), { crewId: "B", personIds: ["luis"], start: new Date("2026-10-28T13:00:00Z"), end: new Date("2026-10-28T15:00:00Z") }, crews, roster);
    expect(v).toMatchObject({ crewId: "B", crewName: "Crew B", people: [{ id: "luis", name: "Luis F" }], start: "2026-10-28T13:00:00.000Z" });
  });

  it("keeps the New York time of day when dropped on another date, across DST", () => {
    // 9:00 AM EDT on Oct 27 -> same 9:00 AM on Nov 3, after fall-back.
    expect(startOnDate("2026-10-27T13:00:00Z", "2026-11-03").toISOString()).toBe("2026-11-03T14:00:00.000Z");
  });
});
