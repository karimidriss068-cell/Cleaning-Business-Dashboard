import type { AdvisorKey } from "@/lib/board/advisors";
import type { Beat, Reaction, Vote } from "@/lib/board/scene/script";

// A tiny playback state machine for the boardroom scene: pure, so playback, speed, skip and replay are
// tested without a browser. The component only feeds it elapsed time.

/** Milliseconds per streamed character at 1x (about 55 characters a second). */
export const CHAR_MS = 18;
export const SPEEDS = [0.5, 1, 2, 4] as const;

export type PlayerState = { beat: number; elapsed: number; playing: boolean; speed: number; done: boolean };

export function beatMs(b: Beat, reduced = false): number {
  // Reduced motion: text appears at once, so a beat is just reading time.
  const read = (t: string) => (reduced ? 1500 + t.length * 10 : t.length * CHAR_MS + 800);
  switch (b.kind) {
    case "chair_open":
    case "verdict":
      return read(b.text);
    case "speak":
      return read(b.text);
    case "think":
      return reduced ? 400 : 1100;
    case "react":
      return reduced ? 1200 : 1000;
    case "vote":
      return reduced ? 900 : 800;
    case "dissent":
      return reduced ? 1500 + b.items.length * 600 : b.items.length * 700 + 700;
    case "actions":
      return reduced ? 2000 + b.items.length * 600 : b.items.length * 1100 + 1000;
  }
}

export const initialPlayer = (playing = true): PlayerState => ({ beat: 0, elapsed: 0, playing, speed: 1, done: false });

export function tick(s: PlayerState, script: readonly Beat[], dtMs: number, reduced = false): PlayerState {
  if (!s.playing || s.done || script.length === 0) return s;
  let beat = s.beat;
  let elapsed = s.elapsed + dtMs * s.speed;
  for (;;) {
    const dur = beatMs(script[beat], reduced);
    if (elapsed < dur) return { ...s, beat, elapsed };
    if (beat >= script.length - 1) return { ...s, beat, elapsed: dur, playing: false, done: true };
    elapsed -= dur;
    beat += 1;
  }
}

export const play = (s: PlayerState): PlayerState => (s.done ? s : { ...s, playing: true });
export const pause = (s: PlayerState): PlayerState => ({ ...s, playing: false });
export const setSpeed = (s: PlayerState, speed: number): PlayerState => ({ ...s, speed });
export const replay = (s: PlayerState): PlayerState => ({ beat: 0, elapsed: 0, playing: true, speed: s.speed, done: false });

export const verdictIndex = (script: readonly Beat[]) => Math.max(0, script.findIndex((b) => b.kind === "verdict"));

/** Jump to the start of the chair's verdict; every vote before it counts, and the verdict then streams. */
export const skipToVerdict = (s: PlayerState, script: readonly Beat[]): PlayerState => ({ ...s, beat: verdictIndex(script), elapsed: 0, playing: true, done: false });

export function seek(s: PlayerState, script: readonly Beat[], beat: number, progress = 0, reduced = false): PlayerState {
  const i = Math.min(Math.max(0, beat), script.length - 1);
  const done = i === script.length - 1 && progress >= 1;
  return { ...s, beat: i, elapsed: Math.min(1, Math.max(0, progress)) * beatMs(script[i], reduced), playing: false, done };
}

/** Screenshot and test moments: where to seek in a script. */
export function momentOf(script: readonly Beat[], moment: "opening" | "debate" | "verdict"): { beat: number; progress: number } {
  if (moment === "opening") return { beat: 0, progress: 0.7 };
  if (moment === "verdict") return { beat: script.length - 1, progress: 1 };
  const speaks = script.map((b, i) => (b.kind === "speak" ? i : -1)).filter((i) => i >= 0);
  const mid = speaks[Math.min(speaks.length - 1, Math.floor(speaks.length / 2))] ?? 1;
  return { beat: mid, progress: 0.55 };
}

// ---- what the scene shows at a moment ----

export type FeedItem =
  | { id: number; kind: "chair"; text: string; streaming: boolean }
  | { id: number; kind: "speak"; who: AdvisorKey; round: 1 | 2; text: string; streaming: boolean }
  | { id: number; kind: "react"; who: AdvisorKey; target: AdvisorKey; reaction: Reaction }
  | { id: number; kind: "vote"; who: AdvisorKey; vote: Vote };

export type Stage = "opening" | "debate" | "voting" | "verdict";

export type SceneView = {
  stage: Stage;
  /** Who is speaking or thinking right now ("chair" for the chair). */
  speaker: AdvisorKey | "chair" | null;
  thinking: AdvisorKey | null;
  /** The text currently on screen in the speech bubble (streamed). */
  bubble: { who: AdvisorKey | "chair"; text: string; streaming: boolean } | null;
  feed: FeedItem[];
  votes: Partial<Record<AdvisorKey, Vote>>;
  tally: Record<Vote, number>;
  reaction: { actor: AdvisorKey; target: AdvisorKey; reaction: Reaction } | null;
  reveal: { verdict: boolean; dissent: boolean; actions: number };
  progress: number;
};

const shown = (text: string, elapsed: number, reduced: boolean) => (reduced ? text : text.slice(0, Math.max(0, Math.floor(elapsed / CHAR_MS))));

export function deriveView(script: readonly Beat[], s: PlayerState, reduced = false): SceneView {
  const feed: FeedItem[] = [];
  const votes: Partial<Record<AdvisorKey, Vote>> = {};
  let bubble: SceneView["bubble"] = null;
  let reaction: SceneView["reaction"] = null;
  let thinking: AdvisorKey | null = null;
  const reveal = { verdict: false, dissent: false, actions: 0 };
  const upto = script.length === 0 ? -1 : Math.min(s.beat, script.length - 1);
  for (let i = 0; i <= upto; i++) {
    const b = script[i];
    const current = i === upto && !s.done;
    const full = !current;
    switch (b.kind) {
      case "chair_open":
      case "verdict": {
        const text = full ? b.text : shown(b.text, s.elapsed, reduced);
        const streaming = !full && text.length < b.text.length;
        if (b.kind === "chair_open") feed.push({ id: i, kind: "chair", text, streaming });
        else { feed.push({ id: i, kind: "chair", text, streaming }); reveal.verdict = true; }
        bubble = { who: "chair", text, streaming };
        break;
      }
      case "think":
        if (current) thinking = b.actor;
        break;
      case "speak": {
        const text = full ? b.text : shown(b.text, s.elapsed, reduced);
        const streaming = !full && text.length < b.text.length;
        feed.push({ id: i, kind: "speak", who: b.actor, round: b.round, text, streaming });
        bubble = { who: b.actor, text, streaming };
        break;
      }
      case "react":
        feed.push({ id: i, kind: "react", who: b.actor, target: b.target, reaction: b.reaction });
        if (current) reaction = { actor: b.actor, target: b.target, reaction: b.reaction };
        break;
      case "vote":
        votes[b.actor] = b.vote;
        feed.push({ id: i, kind: "vote", who: b.actor, vote: b.vote });
        break;
      case "dissent":
        reveal.dissent = true;
        break;
      case "actions":
        reveal.actions = full || reduced ? b.items.length : Math.min(b.items.length, Math.floor(s.elapsed / 1100) + 1);
        break;
    }
  }
  const tally: Record<Vote, number> = { for: 0, conditional: 0, against: 0 };
  for (const v of Object.values(votes)) tally[v] += 1;
  const cur = script[upto];
  const stage: Stage = !cur || cur.kind === "chair_open" ? "opening" : cur.kind === "vote" ? "voting" : cur.kind === "verdict" || cur.kind === "dissent" || cur.kind === "actions" ? "verdict" : "debate";
  const speaker: SceneView["speaker"] = !cur ? null : cur.kind === "speak" ? cur.actor : cur.kind === "think" ? cur.actor : cur.kind === "chair_open" || cur.kind === "verdict" || cur.kind === "dissent" || cur.kind === "actions" ? "chair" : null;
  const total = script.reduce((n, b) => n + beatMs(b, reduced), 0);
  const before = script.slice(0, Math.max(0, upto)).reduce((n, b) => n + beatMs(b, reduced), 0);
  return {
    stage, speaker: s.done ? null : speaker, thinking, bubble, feed, votes, tally, reaction, reveal,
    progress: total === 0 ? 0 : s.done ? 1 : Math.min(1, (before + s.elapsed) / total),
  };
}
