import { worstCaseMicros, microsToCents } from "@/lib/ai/pricing";
import { ADVISOR_MAX_TOKENS, PASSED_ON_CHARS, SYNTHESIS_MAX_TOKENS, advisorSystem, synthesisSystem } from "@/lib/board/prompt";
import { MAX_CONTEXT_CHARS } from "@/lib/board/context";
import type { AdvisorKey } from "@/lib/board/advisors";

export const ADVISOR_MODEL = "claude-haiku-5-5" as const;
export const SYNTHESIS_MODEL = "claude-sonnet-5-5" as const;

// The estimate is the same worst-case figure callModel holds against the caps before each call, added
// up for the whole session, so "up to" really is an upper bound. Later prompts are not known yet, so
// they are sized at their largest: every passed-on reply at its length limit.

const WRAPPER_CHARS = 120;

export type SessionEstimate = { micros: number; cents: number; calls: number; advisorMicros: number; synthesisMicros: number };

export function estimateSession(args: { questionChars: number; advisors: readonly AdvisorKey[]; rounds: 1 | 2; useContext: boolean }): SessionEstimate {
  const ctx = args.useContext ? MAX_CONTEXT_CHARS : 0;
  const n = args.advisors.length;
  let advisorMicros = 0;
  for (const key of args.advisors) {
    const system = advisorSystem(key).length;
    const round1 = system + args.questionChars + ctx + WRAPPER_CHARS;
    advisorMicros += worstCaseMicros(ADVISOR_MODEL, round1, ADVISOR_MAX_TOKENS, true);
    if (args.rounds === 2) {
      const round2 = round1 + (n - 1) * (PASSED_ON_CHARS + 40) + 260;
      advisorMicros += worstCaseMicros(ADVISOR_MODEL, round2, ADVISOR_MAX_TOKENS, true);
    }
  }
  const synthInput = synthesisSystem().length + args.questionChars + ctx + n * (PASSED_ON_CHARS + 40) + WRAPPER_CHARS;
  const synthesisMicros = worstCaseMicros(SYNTHESIS_MODEL, synthInput, SYNTHESIS_MAX_TOKENS, true);
  const micros = advisorMicros + synthesisMicros;
  return { micros, cents: microsToCents(micros), calls: n * args.rounds + 1, advisorMicros, synthesisMicros };
}
