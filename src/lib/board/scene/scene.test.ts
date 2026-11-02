import { describe, expect, it } from "vitest";
import { MOCK_SCENE } from "@/lib/board/scene/mock";
import { CHAIR_SEAT, ringPositions, seatPositions } from "@/lib/board/scene/layout";
import { CHAR_MS, beatMs, deriveView, initialPlayer, momentOf, pause, play, replay, seek, setSpeed, skipToVerdict, tick, verdictIndex } from "@/lib/board/scene/player";
import { buildScript, type Beat } from "@/lib/board/scene/script";
import { ADVISOR_KEYS } from "@/lib/board/advisors";

const script = buildScript(MOCK_SCENE);
const kinds = (s: readonly Beat[]) => s.map((b) => b.kind);
const total = (reduced = false) => script.reduce((n, b) => n + beatMs(b, reduced), 0);

describe("the script", () => {
  it("opens with the chair, then debates, votes, and the chair closes with verdict, dissent and actions", () => {
    expect(script[0].kind).toBe("chair_open");
    expect(kinds(script).slice(-3)).toEqual(["verdict", "dissent", "actions"]);
    const lastVote = kinds(script).lastIndexOf("vote");
    expect(lastVote).toBeLessThan(verdictIndex(script));
    expect(kinds(script).indexOf("vote")).toBeGreaterThan(kinds(script).lastIndexOf("speak"));
  });
  it("has every advisor think, then speak, in seating order, round 1 before round 2", () => {
    const speaks = script.filter((b): b is Extract<Beat, { kind: "speak" }> => b.kind === "speak");
    expect(speaks.filter((s) => s.round === 1).map((s) => s.actor)).toEqual([...MOCK_SCENE.advisors]);
    expect(speaks.filter((s) => s.round === 2).map((s) => s.actor)).toEqual(["cash_ruin", "operations", "contrarian"]);
    expect(Math.max(...speaks.map((s, i) => (s.round === 1 ? i : -1)))).toBeLessThan(speaks.findIndex((s) => s.round === 2));
    for (const [i, b] of script.entries()) if (b.kind === "speak") expect(script[i - 1]).toMatchObject({ kind: "think", actor: b.actor, round: b.round });
  });
  it("derives reactions from the votes: same agrees, opposite pushes back, a conditional adds a condition", () => {
    const reacts = script.filter((b): b is Extract<Beat, { kind: "react" }> => b.kind === "react");
    expect(reacts.length).toBeGreaterThan(0);
    for (const r of reacts) {
      const a = MOCK_SCENE.votes?.[r.actor];
      const b = MOCK_SCENE.votes?.[r.target];
      expect(r.reaction).toBe(a === b ? "agrees" : a !== "conditional" && b !== "conditional" ? "pushes_back" : "adds_condition");
      expect(r.actor).not.toBe(r.target);
    }
  });
  it("says in the chair's opening that the advisors are AI approximations, not real people", () => {
    expect(script[0]).toMatchObject({ text: expect.stringMatching(/approximations, not real people/) });
  });
  it("skips reactions and votes when there are none, and one round gives no round-2 beats", () => {
    const s = buildScript({ ...MOCK_SCENE, rounds: 1, votes: undefined });
    expect(kinds(s)).not.toContain("react");
    expect(kinds(s)).not.toContain("vote");
    expect(s.some((b) => b.kind === "speak" && b.round === 2)).toBe(false);
    expect(s.at(-1)?.kind).toBe("actions");
  });
});

describe("playback", () => {
  it("advances beat by beat and finishes on the last one", () => {
    let s = initialPlayer();
    let guard = 0;
    while (!s.done && guard++ < 5000) s = tick(s, script, 250);
    expect(s.done).toBe(true);
    expect(s.playing).toBe(false);
    expect(s.beat).toBe(script.length - 1);
  });
  it("runs twice as fast at 2x and half as fast at 0.5x", () => {
    const at = (speed: number) => tick(setSpeed(initialPlayer(), speed), script, 10_000);
    expect(at(2).beat).toBeGreaterThan(at(1).beat);
    expect(at(0.5).beat).toBeLessThan(at(1).beat);
  });
  it("does nothing while paused, and resumes", () => {
    const s = pause(initialPlayer());
    expect(tick(s, script, 5000)).toEqual(s);
    expect(tick(play(s), script, 10_000).beat).toBeGreaterThan(0);
  });
  it("skip jumps to the verdict with every vote counted; replay starts over", () => {
    const skipped = skipToVerdict(initialPlayer(), script);
    expect(skipped.beat).toBe(verdictIndex(script));
    const v = deriveView(script, skipped);
    expect(v.tally).toEqual({ for: 1, conditional: 2, against: 2 });
    expect(v.stage).toBe("verdict");
    const back = replay({ ...skipped, speed: 2, done: true });
    expect(back).toMatchObject({ beat: 0, elapsed: 0, playing: true, done: false, speed: 2 });
  });
  it("seeks to the named moments", () => {
    for (const m of ["opening", "debate", "verdict"] as const) {
      const { beat, progress } = momentOf(script, m);
      const v = deriveView(script, seek(initialPlayer(), script, beat, progress));
      expect(v.stage).toBe(m === "opening" ? "opening" : m === "debate" ? "debate" : "verdict");
    }
  });
});

describe("what the scene shows", () => {
  it("streams the speaker's text a character at a time and shows the thinking state first", () => {
    const i = script.findIndex((b) => b.kind === "think");
    const thinking = deriveView(script, seek(initialPlayer(), script, i, 0.5));
    expect(thinking.thinking).toBe((script[i] as Extract<Beat, { kind: "think" }>).actor);
    expect(thinking.speaker).toBe(thinking.thinking);
    const sp = script[i + 1] as Extract<Beat, { kind: "speak" }>;
    const half = { ...initialPlayer(false), beat: i + 1, elapsed: 20 * CHAR_MS };
    const v = deriveView(script, half);
    expect(v.bubble).toEqual({ who: sp.actor, text: sp.text.slice(0, 20), streaming: true });
    expect(v.thinking).toBeNull();
    const done = deriveView(script, { ...half, beat: i + 2, elapsed: 0 });
    expect(done.feed.find((f) => f.kind === "speak" && f.who === sp.actor)).toMatchObject({ text: sp.text, streaming: false });
  });
  it("shows text instantly under reduced motion", () => {
    const i = script.findIndex((b) => b.kind === "speak");
    const v = deriveView(script, { ...initialPlayer(false), beat: i, elapsed: 0 }, true);
    expect(v.bubble?.text).toBe((script[i] as Extract<Beat, { kind: "speak" }>).text);
    expect(v.bubble?.streaming).toBe(false);
    expect(total(true)).toBeLessThan(total(false));
  });
  it("keeps a live tally that only counts votes already cast", () => {
    const first = script.findIndex((b) => b.kind === "vote");
    expect(deriveView(script, { ...initialPlayer(false), beat: first - 1 }).tally).toEqual({ for: 0, conditional: 0, against: 0 });
    const v = deriveView(script, { ...initialPlayer(false), beat: first + 1 });
    expect(v.tally.for + v.tally.conditional + v.tally.against).toBe(2);
    expect(v.stage).toBe("voting");
  });
  it("reveals the verdict, then the dissent, then the actions one at a time", () => {
    const vi = verdictIndex(script);
    expect(deriveView(script, { ...initialPlayer(false), beat: vi - 1 }).reveal).toEqual({ verdict: false, dissent: false, actions: 0 });
    expect(deriveView(script, { ...initialPlayer(false), beat: vi, elapsed: 10 }).reveal).toEqual({ verdict: true, dissent: false, actions: 0 });
    expect(deriveView(script, { ...initialPlayer(false), beat: vi + 1 }).reveal.dissent).toBe(true);
    const ai = script.length - 1;
    expect(deriveView(script, { ...initialPlayer(false), beat: ai, elapsed: 0 }).reveal.actions).toBe(1);
    expect(deriveView(script, { ...initialPlayer(false), beat: ai, elapsed: 2300 }).reveal.actions).toBe(3);
    expect(deriveView(script, { ...initialPlayer(false), beat: ai, done: true }).reveal.actions).toBe(3);
  });
  it("shows a reaction only while its beat is current", () => {
    const i = script.findIndex((b, n) => b.kind === "react" && script[n + 1]?.kind !== "react");
    expect(deriveView(script, { ...initialPlayer(false), beat: i }).reaction).not.toBeNull();
    expect(deriveView(script, { ...initialPlayer(false), beat: i + 1 }).reaction).toBeNull();
  });
});

describe("seats", () => {
  it("fit inside the scene and never crowd each other, for 1 to 8 advisors", () => {
    for (let n = 1; n <= Math.min(8, ADVISOR_KEYS.length); n++) {
      const seats = [CHAIR_SEAT, ...seatPositions(n)];
      expect(seats).toHaveLength(n + 1);
      for (const s of seats) { expect(s.x).toBeGreaterThan(5); expect(s.x).toBeLessThan(95); expect(s.y).toBeGreaterThan(5); expect(s.y).toBeLessThan(95); }
      for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
        const d = Math.hypot((seats[i].x - seats[j].x) * 1.6, seats[i].y - seats[j].y);
        expect(d).toBeGreaterThan(n >= 8 ? 15 : 19);
      }
    }
  });
});

describe("ring positions", () => {
  it("put the first advisor clockwise from the top and keep every seat on the ring", () => {
    const c = { x: 80, y: 48 };
    const r = { x: 30, y: 30 };
    for (let n = 1; n <= 8; n++) {
      const seats = ringPositions(n, c, r);
      expect(seats).toHaveLength(n);
      for (const s of seats) expect(Math.hypot((s.x - c.x) / r.x, (s.y - c.y) / r.y)).toBeCloseTo(1, 1);
      if (n >= 2) expect(seats[0].x).toBeGreaterThan(c.x);
    }
  });
});
