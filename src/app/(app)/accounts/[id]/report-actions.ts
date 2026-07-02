"use server";

import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * Mints a read-only, 30-day-expiring share token for a client report scoped to
 * one account + date range. Returns the token; the client builds the full URL.
 */
export async function createReportShare(input: {
  accountId: string;
  from: string;
  to: string;
}): Promise<{ token: string } | { error: string }> {
  if (!input.from || !input.to) return { error: "Pick a date range." };

  const supabase = await createClient();
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("report_shares").insert({
    account_id: input.accountId,
    token,
    date_from: input.from,
    date_to: input.to,
    expires_at: expiresAt,
  });

  if (error) return { error: error.message };
  return { token };
}
