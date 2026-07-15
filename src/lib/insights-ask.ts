import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getInsightsData } from "@/lib/insights";
import { getMonthlyUsage, logInsightsQuery } from "@/lib/insights-usage";

const BASE_SYSTEM = `You are a sharp, no-fluff business analyst embedded in "MAKI Ops", the internal dashboard of MAKI, a marketing agency. You answer questions about MAKI's own client-acquisition ads AND the ad accounts MAKI runs for its clients.

You will be given one JSON snapshot of the business as the user message, followed by a question. That snapshot is the ONLY source of truth available to you.

HARD RULES — these override any instinct to be more "helpful":
1. Only use data explicitly present in the provided JSON snapshot. Never draw on general business/marketing knowledge, industry benchmarks, or typical-campaign assumptions. Do not say things like "campaigns like this typically see X%" — you have no basis for that claim.
2. If the snapshot doesn't contain what's needed to answer, say so explicitly — e.g. "I don't have that data" or "that isn't tracked yet" — and stop there. Do not fill the gap with a plausible-sounding guess. Set data_available to false in this case.
3. Every specific number or claim in your answer must trace back to a field in the snapshot. Never invent a statistic, percentage, or dollar figure that isn't computed from the given data.
4. "At risk" accounts, trend directions (rising/declining), and similar judgments are ALREADY COMPUTED for you in the snapshot (risk_assessment, week_over_week fields). Use those computed fields directly — do not recompute or second-guess the arithmetic yourself, and do not call something "at risk" unless risk_assessment.at_risk is true for it.
5. When asked how to improve something, ground the recommendation in specific numbers from the snapshot (e.g. "Script B's reply rate is 12% vs Script A's 40% — pause B, put that volume into A") — not generic marketing advice.
6. Be direct and actionable: give a recommendation, not just an observation, whenever the question calls for one. But never manufacture confidence the data doesn't support.
7. "internal" accounts are MAKI's own client-acquisition ads; "client" accounts are ads MAKI runs for clients. Money is USD.
8. List every account/campaign/creative/outreach script you specifically named in your answer in mentioned_entities, with its exact id and type from the snapshot, so the UI can link to it. Do not include entities you didn't actually reference in the prose.

The exact response fields you must fill are set by the mode-specific instructions below.`;

const SMS_ADDENDUM = `

SMS MODE: This answer will be sent as a raw SMS text message, not shown in the app. Fill \`answer\` with 1-3 short sentences, plain text only — no markdown, no bullet points, no headers, no links. Leave \`caveat\` null — it is not used in this mode.`;

const VOICE_ADDENDUM = `

VOICE MODE: This answer will be spoken aloud by a voice agent on a live phone call, not shown as text. Fill \`answer\` with 1-3 short spoken sentences — something a person could say out loud in under 15-20 seconds. No lists, no markdown, no links, no numbered steps — just natural spoken language. If you cite a number, say it the way a person would speak it. Leave \`caveat\` null — it is not used in this mode.`;

const WEB_ADDENDUM = `

WEB MODE: This answer is rendered as a natural chat response, like Claude or ChatGPT — not a report, not a data table.
- Fill \`answer\` with flowing prose, the way a sharp analyst would actually talk: complete sentences, weaving specific numbers and account/campaign names naturally into the sentence (e.g. "Acme Co is your top-spending account at $4,120 this month, up from $3,050 last month.") — never extract numbers into a separate list or table.
- Use a blank line between paragraphs if the answer genuinely needs more than one (e.g. an observation, then a recommendation). Most answers should be 1-3 short paragraphs — don't pad.
- Only use a simple list (lines starting with "- ") when you are genuinely enumerating several distinct items (e.g. three accounts at risk) — never for a single point, and never a table.
- \`caveat\`: a single short clause ONLY if something material is missing or uncertain (e.g. "no historical data to project from yet"). Null otherwise — never repeat a disclaimer verbosely or by default.
- Never use markdown syntax (no **, no #, no markdown links, no brackets) — plain prose text only. The UI styles numbers and entity names on its own from \`mentioned_entities\`.`;

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe("The direct answer to the question, in natural prose, citing specific numbers from the snapshot."),
  caveat: z
    .string()
    .nullable()
    .describe("A single short clause noting missing/uncertain data, only if relevant. Null otherwise."),
  data_available: z
    .boolean()
    .describe("False if the snapshot did not contain what was needed to answer the question."),
  mentioned_entities: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["account", "campaign", "creative", "script"]),
        id: z.string(),
      }),
    )
    .describe("Every account/campaign/creative/script explicitly referenced in the answer text, exactly as named there."),
});

export type InsightsAnswer = z.infer<typeof AnswerSchema>;

export type AskInsightsResult =
  | { result: InsightsAnswer }
  | { limited: true; used: number; cap: number }
  | { error: string };

// Hard safety nets — even if the model ignores the length instruction, the
// reply must still fit the delivery channel. Voice is tighter than SMS:
// ~15-20s spoken at a natural pace is roughly 40-55 words / 220-300 chars.
const SMS_MAX_CHARS = 480;
const VOICE_MAX_CHARS = 300;

/**
 * The shared core behind the /insights chat UI, the SMS route, and the
 * voice (Retell) route. Takes an explicit user identity rather than reading
 * a session, so callers with no browser session (the SMS/voice webhook
 * routes, using the admin client) can attribute usage the same way the
 * authenticated chat UI does.
 */
export async function askInsightsCore(
  supabase: SupabaseClient<Database>,
  user: { id: string; email: string },
  question: string,
  opts?: { mode?: "web" | "sms" | "voice"; callerPhone?: string },
): Promise<AskInsightsResult> {
  const q = question.trim();
  if (!q) return { error: "Ask a question first." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "AI is not configured. Add ANTHROPIC_API_KEY to your environment to enable Insights.",
    };
  }

  const mode = opts?.mode ?? "web";

  const usage = await getMonthlyUsage(supabase, user.id);
  if (usage.queryCount >= usage.cap) {
    return { limited: true, used: usage.queryCount, cap: usage.cap };
  }

  const data = await getInsightsData(supabase);
  const client = new Anthropic({ apiKey });
  const system =
    mode === "sms"
      ? BASE_SYSTEM + SMS_ADDENDUM
      : mode === "voice"
        ? BASE_SYSTEM + VOICE_ADDENDUM
        : BASE_SYSTEM + WEB_ADDENDUM;

  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system,
      messages: [
        {
          role: "user",
          content: `Here is the current MAKI Ops data snapshot as JSON:\n\n${JSON.stringify(
            data,
          )}\n\nQuestion: ${q}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(AnswerSchema),
      },
    });

    // Log usage regardless of whether parsing succeeded — the API call was
    // made and billed either way.
    await logInsightsQuery(supabase, {
      userId: user.id,
      userEmail: user.email,
      question: q,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      channel: mode,
      callerPhone: opts?.callerPhone,
    });

    if (!message.parsed_output) {
      return { error: "No answer returned." };
    }

    const maxChars = mode === "sms" ? SMS_MAX_CHARS : mode === "voice" ? VOICE_MAX_CHARS : null;
    if (maxChars && message.parsed_output.answer.length > maxChars) {
      message.parsed_output.answer =
        message.parsed_output.answer.slice(0, maxChars - 1).trimEnd() + "…";
    }

    return { result: message.parsed_output };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return { error: `AI request failed: ${detail}` };
  }
}
