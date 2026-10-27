import { describe, expect, it } from "vitest";
import { buildLanes, cellId, parseCellId, shortName, visitsOnDate, weekOf, type BoardVisit } from "./schedule-lanes";

const visit = (id: string, over: Partial<BoardVisit> = {}): BoardVisit => ({
  id, updatedAt: "2026-10-25T00:00:00Z", start: `2026-10-26T1${id}:00:00Z`, end: `2026-10-26T1${id}:30:00Z`, status: "scheduled", clientName: "Client", serviceName: "Standard",
  borough: "brooklyn", priceCents: 10000, crewId: null, crewName: null, people: [], ...over,
});
const crews = [{ id: "c1", name: "Crew A" }, { id: "c2", name: "Crew B" }];
const people = [{ id: "p1", name: "Ana Ruiz" }, { id: "p2", name: "Luis F" }, { id: "p3", name: "Mei Lin" }];

describe("buildLanes", () => {
  const visits = [
    visit("3", { crewId: "c1", people: [{ id: "p1", name: "Ana Ruiz" }, { id: "p2", name: "Luis F" }] }),
    visit("1", { crewId: "c1", people: [{ id: "p1", name: "Ana Ruiz" }] }),
    visit("2", { crewId: null, people: [] }),
  ];

  it("crew mode: a lane per crew (free ones too), sorted by start, plus Unassigned", () => {
    const lanes = buildLanes("crew", visits, crews, people);
    expect(lanes.map((l) => l.label)).toEqual(["Crew A", "Crew B", "Unassigned"]);
    expect(lanes[0].visits.map((v) => v.id)).toEqual(["1", "3"]);
    expect(lanes[1].visits).toEqual([]);
    expect(lanes[2].visits.map((v) => v.id)).toEqual(["2"]);
  });

  it("person mode: a visit appears in each cleaner's lane; nobody on it means Unassigned", () => {
    const lanes = buildLanes("person", visits, crews, people);
    expect(lanes.map((l) => l.label)).toEqual(["Ana Ruiz", "Luis F", "Mei Lin", "Unassigned"]);
    expect(lanes[0].visits.map((v) => v.id)).toEqual(["1", "3"]);
    expect(lanes[1].visits.map((v) => v.id)).toEqual(["3"]);
    expect(lanes[2].visits).toEqual([]);
    expect(lanes[3].visits.map((v) => v.id)).toEqual(["2"]);
  });

  it("shortens names for tight cards", () => {
    expect(shortName("Ana Ruiz")).toBe("Ana R.");
    expect(shortName("Luis")).toBe("Luis");
    expect(shortName("Maria de la Cruz")).toBe("Maria C.");
  });
});

describe("week helpers", () => {
  it("returns Monday to Sunday around any date, across a DST change", () => {
    expect(weekOf("2026-10-28")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(weekOf("2026-10-26")[0]).toBe("2026-10-26");
    expect(weekOf("2026-11-01")[0]).toBe("2026-10-26"); // Sunday belongs to the week before
  });

  it("groups visits by New York date, not UTC", () => {
    const late = visit("1", { start: "2026-10-28T02:30:00Z" }); // 10:30 PM Oct 27 in NY
    const morning = visit("2", { start: "2026-10-28T13:00:00Z" });
    expect(visitsOnDate([morning, late], "2026-10-27").map((v) => v.id)).toEqual(["1"]);
    expect(visitsOnDate([morning, late], "2026-10-28").map((v) => v.id)).toEqual(["2"]);
  });

  it("round-trips week-cell ids and rejects lane ids", () => {
    expect(parseCellId(cellId("5eed0000-0012-4000-8000-000000000001", "2026-10-27"))).toEqual({ laneId: "5eed0000-0012-4000-8000-000000000001", date: "2026-10-27" });
    expect(parseCellId("unassigned::2026-10-27")).toEqual({ laneId: "unassigned", date: "2026-10-27" });
    expect(parseCellId("5eed0000-0012-4000-8000-000000000001")).toBeNull();
  });
});
