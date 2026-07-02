"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getInsightsData } from "@/lib/insights";

const SYSTEM = `You are a sharp, no-fluff analyst embedded in "MAKI Ops", the internal dashboard of MAKI, a marketing agency. Answer the operator's question using ONLY the JSON data provided in the user message — do not invent numbers.

Rules:
- Be direct and specific. Cite the actual figures (money in USD).
- Keep it to a few sentences — this should read like asking a sharp analyst, not a report.
- "internal" accounts are MAKI's own client-acquisition ads; "client" accounts are ones MAKI runs ads for at $327 per booked appointment.
- If the data doesn't contain enough to answer, say so plainly rather than guessing.`;

export async function askInsights(
  question: string,
): Promise<{ answer: string } | { error: string }> {
  const q = question.trim();
  if (!q) return { error: "Ask a question first." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "AI is not configured. Add ANTHROPIC_API_KEY to your environment to enable Insights.",
    };
  }

  const supabase = await createClient();
  const data = await getInsightsData(supabase);

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Here is the current MAKI Ops data as JSON:\n\n${JSON.stringify(
            data,
          )}\n\nQuestion: ${q}`,
        },
      ],
    });

    const answer = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return { answer: answer || "No answer returned." };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return { error: `AI request failed: ${detail}` };
  }
}
