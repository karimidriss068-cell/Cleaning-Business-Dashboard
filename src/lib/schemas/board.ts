import { z } from "zod";
import { ADVISOR_KEYS, type AdvisorKey } from "@/lib/board/advisors";

// The Roast Room contract, shared by the form, the server actions and the stored rows.

export const MAX_QUESTION_CHARS = 4000;

export const boardRunSchema = z.object({
  question: z.string().trim().min(10, "Describe the decision in a sentence or two").max(MAX_QUESTION_CHARS, `Keep it under ${MAX_QUESTION_CHARS.toLocaleString("en-US")} characters`),
  advisors: z
    .array(z.enum(ADVISOR_KEYS as unknown as [AdvisorKey, ...AdvisorKey[]]))
    .min(1, "Pick at least one advisor")
    .max(8)
    .refine((a) => new Set(a).size === a.length, "Each advisor can sit once"),
  rounds: z.union([z.literal(1), z.literal(2)]),
  useContext: z.boolean(),
});
export type BoardRunInput = z.infer<typeof boardRunSchema>;

/** What the synthesis must return. Exactly three actions, in priority order. */
export const synthesisSchema = z.object({
  verdict: z.string().trim().min(1).max(700),
  summary: z.string().trim().min(1).max(2500),
  agreements: z.array(z.string().trim().min(1).max(400)).max(6),
  disagreements: z.array(z.string().trim().min(1).max(400)).max(6),
  actions: z.array(z.object({ title: z.string().trim().min(1).max(280), why: z.string().trim().min(1).max(500) })).length(3),
});
export type Synthesis = z.infer<typeof synthesisSchema>;

/** A synthesis the model returned but we could not read as JSON: shown as text, never logged. */
export const rawSynthesisSchema = z.object({ raw: z.string().max(8000) });

export const advisorOutputSchema = z.object({
  advisor: z.enum(ADVISOR_KEYS as unknown as [AdvisorKey, ...AdvisorKey[]]),
  round: z.number().int().min(1).max(2),
  text: z.string(),
  cost_micros: z.number().int().min(0),
});
export type AdvisorOutput = z.infer<typeof advisorOutputSchema>;

export const boardSessionRowSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  question: z.string(),
  advisors: z.array(z.enum(ADVISOR_KEYS as unknown as [AdvisorKey, ...AdvisorKey[]])),
  rounds: z.number().int(),
  use_context: z.boolean(),
  status: z.enum(["done", "partial"]),
  advisor_outputs: z.array(advisorOutputSchema),
  synthesis: z.union([synthesisSchema, rawSynthesisSchema, z.null()]),
  est_micros: z.number(),
  cost_micros: z.number(),
  logged_decision_id: z.string().uuid().nullable(),
});
export type BoardSessionRow = z.infer<typeof boardSessionRowSchema>;

export const logDecisionSchema = z.object({
  sessionId: z.string().uuid(),
  actionIndex: z.number().int().min(0).max(2),
});
export const sessionIdSchema = z.object({ sessionId: z.string().uuid() });
