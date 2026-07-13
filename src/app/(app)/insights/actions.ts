"use server";

import { createClient } from "@/lib/supabase/server";
import { askInsightsCore, type AskInsightsResult } from "@/lib/insights-ask";

export type { InsightsAnswer, AskInsightsResult } from "@/lib/insights-ask";

export async function askInsights(question: string): Promise<AskInsightsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  return askInsightsCore(supabase, { id: user.id, email: user.email ?? "unknown" }, question);
}
