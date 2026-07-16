import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getInsightsData, scopeSnapshotToAccount } from "@/lib/insights";
import { getMonthlyUsage, logInsightsQuery } from "@/lib/insights-usage";

const BASE_SYSTEM = `You are a sharp, no-fluff business analyst embedded in "MAKI Ops", the internal dashboard of MAKI, a marketing agency. You answer questions about MAKI's own client-acquisition ads AND the ad accounts MAKI runs for its clients.

You will be given one JSON snapshot of the business as the user message, followed by a question. That snapshot is the ONLY source of truth available to you.

HARD RULES — these override any instinct to be more "helpful":
1. Only use data explicitly present in the provided JSON snapshot. Never draw on general business/marketing knowledge, industry benchmarks, or typical-campaign assumptions. Do not say things like "campaigns like this typically see X%" — you have no basis for that claim.
2. If the snapshot doesn't contain what's needed to answer, say so explicitly — e.g. "I don't have that data" or "that isn't tracked yet" — and stop there. Do not fill the gap with a plausible-sounding guess. Set data_available to false in this case.
3. Every specific number or claim in your answer must trace back to a field in the snapshot. Never invent a statistic, percentage, or dollar figure that isn't computed from the given data.
4. "At risk" accounts, trend directions (rising/declining), and similar judgments are ALREADY COMPUTED for you in the snapshot (risk_assessment, week_over_week, month_over_month fields). Use those computed fields directly — do not recompute or second-guess the arithmetic yourself, and do not call something "at risk" unless risk_assessment.at_risk is true for it.
5. When asked how to improve something, ground the recommendation in specific numbers from the snapshot (e.g. "Script B's reply rate is 12% vs Script A's 40% — pause B, put that volume into A") — not generic marketing advice.
6. Be direct and actionable: give a recommendation, not just an observation, whenever the question calls for one. But never manufacture confidence the data doesn't support.
7. "internal" accounts are MAKI's own client-acquisition ads; "client" accounts are ads MAKI runs for clients. Money is USD.
8. List every account/campaign/creative/outreach script you specifically named in your answer in mentioned_entities, with its exact id and type from the snapshot, so the UI can link to it. Do not include entities you didn't actually reference in the prose.
9. Every account carries \`week_over_week\` (this week vs last week) and \`month_over_month\` (this calendar month vs last) for spend/leads/appointments/CPA; campaigns carry \`week_over_week\` too, creatives carry a lighter CPA-only \`week_over_week\`. When a question is about performance, trend, or "how's X doing" — even if not explicitly asked for a comparison — actively surface the relevant one (e.g. "up 20% from last week" or "flat month over month") rather than reporting only the current-period total in isolation. Pick whichever period (week or month) is more relevant to the question; don't dump both unless asked.
10. The top-level \`lead_response\` field tracks speed-to-lead: leads still sitting uncontacted (status 'new'), bucketed into \`warning\` (past \`warning_threshold_minutes\`, where conversion odds drop the most) and \`critical\`/"ghost leads" (past \`critical_threshold_hours\`, likely lost without intervention), both overall and per account in \`by_account\`. Use this directly for any "response time," "leads slipping through," or "ghost leads" question — critical counts are the more urgent number, lead with those when both are present.
11. Accounts, campaigns, and creatives all carry \`revenue_data\` — REAL client-confirmed job revenue collected by SMS a few days after each appointment, distinct from \`last30d.revenue\` (which is just appointments × price_per_appointment, an estimate, not a confirmed close). Prefer \`revenue_data\` for any question about ROI, "was this worth it", or actual return — it's the truth; the estimate is a fallback only. Ground rules for it: (a) \`true_roi_30d\`/\`true_cpa_per_closed_job_30d\` are null whenever \`jobs_closed_30d\` is 0 — that means no confirmed closes yet, NOT zero revenue; say so explicitly, never report a $0 or missing ROI as if the campaign generated nothing. (b) If \`jobs_pending_reply_30d\` > 0, the revenue picture is incomplete — mention that plainly (e.g. "3 of 8 appointments haven't reported back yet, so this is a partial picture") rather than presenting a partial number as final. (c) Never compute your own ROI/CPA-per-job from \`closed_revenue_30d\` and spend — use the pre-computed \`true_roi_30d\`/\`true_cpa_per_closed_job_30d\` fields, same reasoning as rule 4.

The exact response fields you must fill are set by the mode-specific instructions below.`;

const SMS_ADDENDUM = `

SMS MODE: This answer will be sent as a raw SMS text message, not shown in the app. Fill \`answer\` with 1-3 short sentences, plain text only — no markdown, no bullet points, no headers, no links. Leave \`caveat\` and \`follow_ups\` null — they are not used in this mode.`;

const VOICE_ADDENDUM = `

VOICE MODE: This answer will be spoken aloud by a voice agent on a live phone call, not shown as text. Fill \`answer\` with 1-3 short spoken sentences — something a person could say out loud in under 15-20 seconds. No lists, no markdown, no links, no numbered steps — just natural spoken language. If you cite a number, say it the way a person would speak it. Leave \`caveat\` and \`follow_ups\` null — they are not used in this mode.`;

const WEB_ADDENDUM = `

WEB MODE: This answer is rendered as a natural chat response, like Claude or ChatGPT — not a report, not a data table.
- Fill \`answer\` with flowing prose, the way a sharp analyst would actually talk: complete sentences, weaving specific numbers and account/campaign names naturally into the sentence (e.g. "Acme Co is your top-spending account at $4,120 this month, up from $3,050 last month.") — never extract numbers into a separate list or table.
- Use a blank line between paragraphs if the answer genuinely needs more than one (e.g. an observation, then a recommendation). Most answers should be 1-3 short paragraphs — don't pad.
- Only use a simple list (lines starting with "- ") when you are genuinely enumerating several distinct items (e.g. three accounts at risk) — never for a single point, and never a table.
- \`caveat\`: a single short clause ONLY if something material is missing or uncertain (e.g. "no historical data to project from yet"). Null otherwise — never repeat a disclaimer verbosely or by default.
- \`follow_ups\`: 2-3 short, natural follow-up questions the user would plausibly ask next, based SPECIFICALLY on the data you just surfaced in this answer — not generic questions like "how can I improve this?". If your answer names an at-risk account, a plausible follow-up asks about that specific account by name; if it flags a declining metric, a plausible follow-up asks why or what to do about it. Phrase each one the way the user would actually type it (short, casual, no "Would you like to know..." framing). Null only if there is truly nothing sensible to follow up on.
- Never use markdown syntax (no **, no #, no markdown links, no brackets) — plain prose text only. The UI styles numbers and entity names on its own from \`mentioned_entities\`.`;

const ANALYSIS_ADDENDUM = `

ANALYSIS MODE: This is not a single Q&A — you are generating a full structured business analysis report, still read as natural prose (same style as web mode: flowing paragraphs, no markdown). Fill \`answer\` with a comprehensive report, covering these topics IN ORDER as separate paragraphs (blank line between each, no headers — just a clear topic-led sentence opening each one):
1. Top performers — which accounts/campaigns/creatives are winning and specifically why, citing the numbers.
2. Underperformers / at-risk accounts — pull directly from each account's risk_assessment; be specific about why each is flagged, not vague.
3. Recommended actions — concrete, prioritized next steps, each tied to a specific number or named account/campaign/creative. Not "consider reviewing X" — say exactly what to do and why, in priority order.
4. Notable trends vs the prior period — pull from week_over_week/month_over_month fields, call out the most significant movements (up or down).
If the snapshot genuinely has nothing to say for a section (e.g. no at-risk accounts right now), say that briefly in one sentence rather than omitting the section silently. \`follow_ups\`: 2-3 natural deep-dive questions a reader would plausibly want to ask after reading this report. \`caveat\`: only if something material is missing. Never use markdown syntax.`;

const SPACE_ADDENDUM_TEMPLATE = (name: string, scopedToAccount: boolean, contextNotes: string | null) => `

FOCUS SPACE CONTEXT: This conversation is happening inside the "${name}" focus space${scopedToAccount ? " — the data snapshot below has already been narrowed to ONLY that account's data, so treat it as the full scope of what's being discussed" : ""}.${contextNotes ? ` Persistent notes for this space (always keep these in mind): ${contextNotes}` : ""} When the user asks something like "how are we doing" without naming an account, they mean this space's context — do not ask them to clarify which account.`;

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe("The direct answer to the question, in natural prose, citing specific numbers from the snapshot."),
  caveat: z
    .string()
    .nullable()
    .describe("A single short clause noting missing/uncertain data, only if relevant. Null otherwise."),
  follow_ups: z
    .array(z.string())
    .nullable()
    .describe("Web mode only: 2-3 short natural follow-up questions based specifically on this answer. Null for sms/voice mode."),
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
  opts?: {
    mode?: "web" | "sms" | "voice" | "analysis";
    callerPhone?: string;
    space?: { name: string; accountId: string | null; contextNotes: string | null };
  },
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

  let data = await getInsightsData(supabase);
  if (opts?.space?.accountId) {
    data = scopeSnapshotToAccount(data, opts.space.accountId);
  }

  const client = new Anthropic({ apiKey });
  let system =
    mode === "sms"
      ? BASE_SYSTEM + SMS_ADDENDUM
      : mode === "voice"
        ? BASE_SYSTEM + VOICE_ADDENDUM
        : mode === "analysis"
          ? BASE_SYSTEM + ANALYSIS_ADDENDUM
          : BASE_SYSTEM + WEB_ADDENDUM;
  if (opts?.space) {
    system += SPACE_ADDENDUM_TEMPLATE(opts.space.name, !!opts.space.accountId, opts.space.contextNotes);
  }

  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: mode === "analysis" ? 4096 : 2048,
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
