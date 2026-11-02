import { describe, expect, it } from "vitest";
import type { BoardSessionRow } from "@/lib/schemas/board";
import { buildScript } from "./script";
import { captionText, sceneFromSession, stanceLine, voteFromStance } from "./from-session";

const text = (stance: string) => `Stance: ${stance}\nWhy: a. b.\nBiggest risk: cash runs out\nWhat I would do: cap the trial`;

describe("voteFromStance", () => {
  it.each([
    ["Hire the closer.", "for"],
    ["Yes, go ahead.", "for"],
    ["No. Do not hire yet.", "against"],
    ["Neither option.", "against"],
    ["Don't spend on ads until the offer is fixed.", "against"],
    ["Hire the closer, but only on commission.", "conditional"],
    ["Yes, if calls are recorded.", "conditional"],
    ["Fix the offer before adding people.", "conditional"],
    ["It depends on retention.", "conditional"],
    ["Interesting question.", "conditional"],
  ])("%s -> %s", (stance, want) => expect(voteFromStance(text(stance))).toBe(want));
  it("reads the first line when there is no Stance label", () => expect(voteFromStance("No, absolutely not.\nbecause")).toBe("against"));
  it("finds the stance line", () => expect(stanceLine(text("Do it"))).toBe("Do it"));
});

describe("captionText", () => {
  it("keeps stance, risk and the step; drops the reasoning", () => {
    const c = captionText(text("Hire"));
    expect(c).toBe("Hire. cash runs out. cap the trial.");
    expect(c).not.toContain("a. b.");
  });
  it("falls back to a clipped, single-spaced reply", () => expect(captionText("one\n\n two  three")).toBe("one two three"));
});

const row = (over: Partial<BoardSessionRow> = {}): BoardSessionRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-11-02T00:00:00Z",
  question: "Should I hire?",
  advisors: ["cash_ruin", "operations"],
  rounds: 1,
  use_context: false,
  status: "done",
  advisor_outputs: [
    { advisor: "cash_ruin", round: 1, text: text("No, wait"), cost_micros: 1 },
    { advisor: "operations", round: 1, text: text("Yes, go"), cost_micros: 1 },
  ],
  synthesis: { verdict: "Wait.", summary: "s", agreements: [], disagreements: ["a", "b", "c", "d"], actions: [{ title: "t1", why: "w" }, { title: "t2", why: "w" }, { title: "t3", why: "w" }] },
  est_micros: 1,
  cost_micros: 2,
  logged_decision_id: null,
  ...over,
});

describe("sceneFromSession", () => {
  it("builds a scene whose script has the votes, the verdict and three actions", () => {
    const scene = sceneFromSession(row());
    expect(scene?.votes).toEqual({ cash_ruin: "against", operations: "for" });
    expect(scene?.verdict.dissent).toHaveLength(3);
    const script = buildScript(scene!);
    expect(script.filter((b) => b.kind === "vote")).toHaveLength(2);
    expect(script.at(-1)).toMatchObject({ kind: "actions" });
  });
  it("two rounds: replies are the second round and votes come from it", () => {
    const s = row({ rounds: 2, advisor_outputs: [...row().advisor_outputs, { advisor: "cash_ruin", round: 2, text: text("Yes, if capped"), cost_micros: 1 }] });
    const scene = sceneFromSession(s)!;
    expect(Object.keys(scene.replies ?? {})).toEqual(["cash_ruin"]);
    expect(scene.votes?.cash_ruin).toBe("conditional");
  });
  it("no readable synthesis still plays the debate with a no-verdict chair line", () => {
    const sc = sceneFromSession(row({ synthesis: null }));
    expect(sc?.verdict.actions).toEqual([]);
    expect(sc?.verdict.verdict).toMatch(/could not give a clean verdict/);
  });
  it("no advisor answers means no scene", () => {
    expect(sceneFromSession(row({ synthesis: null, advisor_outputs: [] }))).toBeNull();
  });

});
