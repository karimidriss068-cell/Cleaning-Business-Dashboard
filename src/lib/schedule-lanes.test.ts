import { describe, expect, it } from "vitest";
import { buildLanes, shortName, type BoardVisit } from "./schedule-lanes";

const visit = (id: string, over: Partial<BoardVisit> = {}): BoardVisit => ({
  id, start: `2026-10-26T1${id}:00:00Z`, end: `2026-10-26T1${id}:30:00Z`, status: "scheduled", clientName: "Client", serviceName: "Standard",
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
