import "server-only";
import { createHash } from "node:crypto";
import { AiProviderError, AiRefusedError, type CallModelInput, type CallModelResult } from "@/lib/ai/call-model";
import { type AdvisorKey } from "@/lib/board/advisors";
import { ADVISOR_MODEL, SYNTHESIS_MODEL, estimateSession } from "@/lib/board/estimate";
import { ADVISOR_MAX_TOKENS, PROMPT_VERSION, SYNTHESIS_MAX_TOKENS, advisorSystem, advisorUser, synthesisSystem, synthesisUser } from "@/lib/board/prompt";
import { synthesisSchema, type AdvisorOutput, type BoardRunInput, type Synthesis } from "@/lib/schemas/board";

// Runs one Roast Room session: advisors in parallel (small model), optionally a second round where
// each sees the others' answers, then one synthesis (larger model). Every model call goes through
// callModel() under feature "board", so the caps, the kill switch and the usage log all apply. If a
// cap, the kill switch or the provider stops a call, what finished is saved as a partial session.

export type NewSession = {
  question: string;
  advisors: AdvisorKey[];
  rounds: 1 | 2;
  useContext: boolean;
  inputHash: string;
  status: "done" | "partial";
  advisorOutputs: AdvisorOutput[];
  synthesis: Synthesis | { raw: string } | null;
  estMicros: number;
  costMicros: number;
  runId: string;
};

export type BoardDeps = {
  call: (input: CallModelInput) => Promise<CallModelResult>;
  /** A finished session with the same input hash from the last 24 hours, if any. */
  findCached: (hash: string) => Promise<{ id: string } | null>;
  save: (session: NewSession) => Promise<string>;
  newRunId: () => string;
};

export type BoardOutcome =
  | { kind: "cached"; sessionId: string }
  | { kind: "saved"; sessionId: string; status: "done" | "partial"; costMicros: number; stopped: string | null }
  | { kind: "refused"; message: string };

export function inputHash(input: BoardRunInput, context: string | null): string {
  const payload = JSON.stringify([PROMPT_VERSION, input.question.trim(), [...input.advisors].sort(), input.rounds, context ?? ""]);
  return createHash("sha256").update(payload).digest("hex");
}

/** Reads the synthesis JSON, tolerating a code fence or a stray sentence around it. */
export function parseSynthesis(text: string): Synthesis | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = synthesisSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const stopMessage = (e: unknown) =>
  e instanceof AiRefusedError || e instanceof AiProviderError ? e.message : "The AI call could not be completed.";

type Settled = { out: AdvisorOutput; cost: number } | { error: unknown };

export async function runBoard(input: BoardRunInput, context: string | null, userId: string, deps: BoardDeps): Promise<BoardOutcome> {
  const hash = inputHash(input, context);
  const cached = await deps.findCached(hash);
  if (cached) return { kind: "cached", sessionId: cached.id };

  const runId = deps.newRunId();
  const actor = { type: "user" as const, id: userId };
  const estMicros = estimateSession({ questionChars: input.question.length, advisors: input.advisors, rounds: input.rounds, useContext: input.useContext }).micros;
  const outputs: AdvisorOutput[] = [];
  let cost = 0;
  let stopped: string | null = null;

  const askRound = async (round: 1 | 2): Promise<AdvisorOutput[]> => {
    const round1 = outputs.filter((o) => o.round === 1);
    const settled: Settled[] = await Promise.all(
      input.advisors.map(async (key): Promise<Settled> => {
        try {
          const r = await deps.call({
            feature: "board", actor, model: ADVISOR_MODEL, runId,
            system: advisorSystem(key), cacheSystem: true, maxTokens: ADVISOR_MAX_TOKENS,
            messages: [{ role: "user", content: advisorUser({ question: input.question, context, round, round1, self: key }) }],
          });
          return { out: { advisor: key, round, text: r.text.trim(), cost_micros: r.costMicros }, cost: r.costMicros };
        } catch (e) {
          return { error: e };
        }
      }),
    );
    const done: AdvisorOutput[] = [];
    for (const s of settled) {
      if ("error" in s) stopped ??= stopMessage(s.error);
      else { done.push(s.out); cost += s.cost; }
    }
    return done;
  };

  for (const round of input.rounds === 2 ? ([1, 2] as const) : ([1] as const)) {
    outputs.push(...(await askRound(round)));
    if (stopped) break;
  }

  if (outputs.length === 0) return { kind: "refused", message: stopped ?? "The AI call could not be completed." };

  let synthesis: Synthesis | { raw: string } | null = null;
  if (!stopped) {
    const finalRound = outputs.filter((o) => o.round === input.rounds);
    try {
      const r = await deps.call({
        feature: "board", actor, model: SYNTHESIS_MODEL, runId,
        system: synthesisSystem(), cacheSystem: true, maxTokens: SYNTHESIS_MAX_TOKENS,
        messages: [{ role: "user", content: synthesisUser({ question: input.question, context, finalRound }) }],
      });
      cost += r.costMicros;
      synthesis = parseSynthesis(r.text) ?? { raw: r.text.trim().slice(0, 8000) };
      if ("raw" in synthesis) stopped = "The synthesis came back in a shape that could not be read, so it is shown as plain text.";
    } catch (e) {
      stopped = stopMessage(e);
    }
  }

  const status = stopped ? "partial" : "done";
  const sessionId = await deps.save({
    question: input.question.trim(), advisors: input.advisors, rounds: input.rounds, useContext: input.useContext,
    inputHash: hash, status, advisorOutputs: outputs, synthesis, estMicros, costMicros: cost, runId,
  });
  return { kind: "saved", sessionId, status, costMicros: cost, stopped };
}
