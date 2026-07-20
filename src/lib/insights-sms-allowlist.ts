import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Digits-only comparison so "+1 929-317-3127", "+19293173127",
 * "19293173127", and the bare US-formatted "(929) 317-3127" all match the
 * same number regardless of formatting. GHL sends both an E.164-ish
 * top-level `phone` (with the leading "1" country code) and, when a workflow
 * defines a Custom Data phone field, a "(xxx) xxx-xxxx" formatted value with
 * no country code at all for the SAME number — so a leading NANP "1" is
 * stripped whenever the digits-only result is 11 long, normalizing both
 * shapes down to the same 10-digit value. Exported for reuse by other
 * channels (e.g. the Retell voice route) that need the same normalization
 * for their own allowlist checks. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/**
 * Maps an allowed phone number to the Supabase Auth user whose usage cap and
 * log the SMS query should count against. Configured via INSIGHTS_SMS_ALLOWLIST
 * (JSON array of {phone, email}) rather than a DB table — this is deliberately
 * lightweight for "just my number, expandable later," not a real per-client
 * access system.
 */
export async function resolveSmsUser(
  adminSupabase: SupabaseClient<Database>,
  incomingPhone: string,
): Promise<{ id: string; email: string } | null> {
  const raw = process.env.INSIGHTS_SMS_ALLOWLIST;
  if (!raw) return null;

  let entries: { phone: string; email: string }[];
  try {
    entries = JSON.parse(raw);
  } catch {
    return null;
  }

  const target = normalizePhone(incomingPhone);
  const match = entries.find((e) => normalizePhone(e.phone) === target);
  if (!match) return null;

  // No direct getUserByEmail in the admin API — list and filter. Fine at the
  // scale of a handful of allowlisted numbers.
  const { data, error } = await adminSupabase.auth.admin.listUsers();
  if (error) return null;

  const user = data.users.find(
    (u) => u.email?.toLowerCase() === match.email.toLowerCase(),
  );
  if (!user) return null;

  return { id: user.id, email: user.email ?? match.email };
}
