import type { AdvisorKey } from "@/lib/board/advisors";
import type { BoardSessionRow } from "@/lib/schemas/board";
import type { SceneInput, Vote } from "@/lib/board/scene/script";

// Turns a saved Roast Room session into the boardroom scene. Pure, nothing is sent to a model: a
// saved session replays from what was stored. Advisors never cast a vote in the prompt (that would
// change the prompt and the cache), so each vote is read from the advisor's own "Stance:" line.

const STANCE_RE = /^\s*stance\s*:\s*(.+)$/im;
const LINE_RE = (label: string) => new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "im");

/** The advisor's stance line, or the first line of the reply. */
export function stanceLine(text: string): string {
  return STANCE_RE.exec(text)?.[1].trim() ?? text.trim().split("\n")[0] ?? "";
}

const AGAINST = /\b(no|not|don'?t|do not|never|neither|avoid|skip|against|wait|hold off|stop|pass)\b/i;
const CONDITIONAL = /\b(if|only|unless|but|first|before|until|provided|once|after|with conditions|conditional|cap|capped|trial|depends)\b/i;
const FOR = /\b(yes|do it|go|hire|start|proceed|approve|support|worth it|good idea|run it|launch)\b/i;

/**
 * Yes, Yes-if or No, from the stance line. Order matters: a flat no wins, then a hedge ("yes, but only
 * if...") reads as conditional, then a plain yes; anything unclear is conditional rather than a guess
 * at a side.
 */
export function voteFromStance(text: string): Vote {
  const s = stanceLine(text);
  const hedged = CONDITIONAL.test(s);
  if (AGAINST.test(s) && !(hedged && FOR.test(s))) return "against";
  if (hedged) return "conditional";
  return FOR.test(s) ? "for" : "conditional";
}

/** What the caption shows: stance, biggest risk and what I would do, not the whole answer. */
export function captionText(text: string): string {
  const parts = ["stance", "biggest risk", "what i would do"]
    .map((label) => LINE_RE(label).exec(text)?.[1].trim())
    .filter((p): p is string => Boolean(p))
    .map((p) => (/[.!?…]$/.test(p) ? p : `${p}.`));
  if (parts.length === 0) return text.trim().replace(/\s+/g, " ").slice(0, 280);
  return parts.join(" ");
}

/** The scene for a saved session, or null when no advisor answered. */
export function sceneFromSession(session: BoardSessionRow): SceneInput | null {
  const syn = session.synthesis;
  if (!session.advisor_outputs.some((o) => o.text.trim())) return null;
  // A session without a readable synthesis still plays the debate; the chair says why there is no verdict.
  const verdict = syn && "verdict" in syn
    ? { verdict: syn.verdict, dissent: syn.disagreements.slice(0, 3), actions: syn.actions }
    : { verdict: "The chair could not give a clean verdict on this session. Read the advisors' answers below.", dissent: [], actions: [] };
  const pick = (round: number) => Object.fromEntries(session.advisor_outputs.filter((o) => o.round === round && o.text.trim()).map((o) => [o.advisor, captionText(o.text)])) as Partial<Record<AdvisorKey, string>>;
  const finalRound = session.rounds === 2 ? 2 : 1;
  const votes = Object.fromEntries(session.advisor_outputs.filter((o) => o.round === finalRound && o.text.trim()).map((o) => [o.advisor, voteFromStance(o.text)])) as Partial<Record<AdvisorKey, Vote>>;
  return {
    question: session.question,
    advisors: session.advisors,
    rounds: session.rounds === 2 ? 2 : 1,
    opening: pick(1),
    replies: session.rounds === 2 ? pick(2) : undefined,
    votes,
    verdict,
  };
}
