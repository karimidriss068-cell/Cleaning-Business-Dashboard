import { advisorByKey, type AdvisorKey } from "@/lib/board/advisors";

// The boardroom scene is a script: an ordered list of beats (the chair opens, an advisor thinks, then
// speaks, others react, everyone votes, the chair gives the verdict). Building it is pure, so the same
// builder serves the sample preview and, later, saved sessions, and it is easy to test. Nothing here
// calls a model.

export type Vote = "for" | "conditional" | "against";
export const VOTE_LABEL: Record<Vote, string> = { for: "Yes", conditional: "Yes, if…", against: "No" };

export type Reaction = "agrees" | "pushes_back" | "adds_condition";
export const REACTION_LABEL: Record<Reaction, string> = { agrees: "Agrees", pushes_back: "Pushes back", adds_condition: "Adds a condition" };

export type SceneInput = {
  question: string;
  advisors: readonly AdvisorKey[];
  rounds: 1 | 2;
  /** Round 1 opening statements by advisor. */
  opening: Partial<Record<AdvisorKey, string>>;
  /** Round 2 replies, for advisors that answered. */
  replies?: Partial<Record<AdvisorKey, string>>;
  votes?: Partial<Record<AdvisorKey, Vote>>;
  verdict: { verdict: string; dissent: string[]; actions: { title: string; why: string }[] };
};

export type Beat =
  | { kind: "chair_open"; text: string }
  | { kind: "think"; actor: AdvisorKey; round: 1 | 2 }
  | { kind: "speak"; actor: AdvisorKey; round: 1 | 2; text: string }
  | { kind: "react"; actor: AdvisorKey; target: AdvisorKey; reaction: Reaction }
  | { kind: "vote"; actor: AdvisorKey; vote: Vote }
  | { kind: "verdict"; text: string }
  | { kind: "dissent"; items: string[] }
  | { kind: "actions"; items: { title: string; why: string }[] };

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

function reactionBetween(a: Vote, b: Vote): Reaction {
  if (a === b) return "agrees";
  return a !== "conditional" && b !== "conditional" ? "pushes_back" : "adds_condition";
}

/** How many other advisors react to each statement. */
const REACTORS_PER_STATEMENT = 2;

export function buildScript(input: SceneInput): Beat[] {
  const beats: Beat[] = [];
  const n = input.advisors.length;
  beats.push({
    kind: "chair_open",
    text: `Today's question: ${clip(input.question.trim(), 150)} ${n} AI ${n === 1 ? "advisor" : "advisors"} (approximations, not real people) will weigh in${input.rounds === 2 ? ", then answer each other once" : ""}. Then you will see the vote.`,
  });
  const votes = input.votes ?? {};
  for (const round of input.rounds === 2 ? ([1, 2] as const) : ([1] as const)) {
    const texts = round === 1 ? input.opening : (input.replies ?? {});
    input.advisors.forEach((key, i) => {
      const text = texts[key];
      if (!text) return;
      beats.push({ kind: "think", actor: key, round });
      beats.push({ kind: "speak", actor: key, round, text });
      const mine = votes[key];
      if (!mine) return;
      let added = 0;
      for (let step = 1; step < n && added < REACTORS_PER_STATEMENT; step++) {
        const other = input.advisors[(i + step) % n];
        const theirs = votes[other];
        if (!theirs) continue;
        beats.push({ kind: "react", actor: other, target: key, reaction: reactionBetween(theirs, mine) });
        added++;
      }
    });
  }
  for (const key of input.advisors) {
    const v = votes[key];
    if (v) beats.push({ kind: "vote", actor: key, vote: v });
  }
  beats.push({ kind: "verdict", text: input.verdict.verdict });
  if (input.verdict.dissent.length) beats.push({ kind: "dissent", items: input.verdict.dissent });
  beats.push({ kind: "actions", items: input.verdict.actions });
  return beats;
}

export const advisorName = (key: AdvisorKey) => advisorByKey(key).name;
