"use server";

import { revalidatePath } from "next/cache";
import { computeBid } from "@/lib/bids";
import { financeContext } from "@/lib/finance-auth";
import { loadPricingRules } from "@/lib/pricing-data";
import { invalid, mapFinanceError, notSignedIn, type FinanceResult } from "@/lib/schemas/finance";
import { bidStatusSchema, saveBidSchema } from "@/lib/schemas/bids";

// Bids. Owner and admin only (the database refuses anyone else). The cost lines and the price are worked
// out here from the saved pricing rules, never taken from the browser; the database sums the lines again
// and works out the margin itself, so the margin floor holds whatever a client sends.

export async function saveBid(input: unknown): Promise<FinanceResult<{ bidId: string; version: number }>> {
  const p = saveBidSchema.safeParse(input);
  if (!p.success) return invalid(p.error.issues[0]?.message ?? "Check the bid");
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  if (!ctx.isAdmin) return { ok: false, code: "forbidden", message: "Only the owner or an admin can build bids." };
  const rules = await loadPricingRules(ctx.supabase);
  if (!rules) return { ok: false, code: "error", message: "Pricing rules couldn't be loaded. Try again." };
  if (rules.version !== p.data.expectedRulesVersion) return { ok: false, code: "stale", message: "Your pricing rules changed. Reload the bid to use the new numbers." };
  let breakdown;
  try {
    breakdown = computeBid(p.data.inputs, rules);
  } catch {
    return invalid("Check the areas and the pricing rules.");
  }
  if (breakdown.priceCents <= 0) return invalid("The price must be more than $0");
  const { data, error } = await ctx.supabase.rpc("save_bid_version", {
    p_title: p.data.title,
    p_inputs: p.data.inputs,
    p_cost_lines: breakdown.costLines,
    p_price_cents: breakdown.priceCents,
    p_expected_rules_version: rules.version,
    p_bid_id: p.data.bidId,
    p_lead_id: p.data.leadId,
    p_company_name: p.data.companyName,
    p_expected_version: p.data.expectedVersion,
    p_floor_override_reason: p.data.floorOverrideReason,
  });
  if (error) return mapFinanceError(error);
  const out = data as { bid_id: string; version: number };
  revalidatePath(`/bids/${out.bid_id}`);
  revalidatePath("/leads");
  return { ok: true, bidId: out.bid_id, version: out.version };
}

export async function setBidStatus(input: unknown): Promise<FinanceResult> {
  const p = bidStatusSchema.safeParse(input);
  if (!p.success) return invalid(p.error.issues[0]?.message ?? "Check the bid");
  const ctx = await financeContext();
  if (!ctx) return notSignedIn;
  const { error } = await ctx.supabase.rpc("set_bid_status", {
    p_bid_id: p.data.bidId,
    p_status: p.data.status,
    p_expected_updated_at: p.data.expectedUpdatedAt,
    p_valid_until: p.data.validUntil,
  });
  if (error) return mapFinanceError(error);
  revalidatePath(`/bids/${p.data.bidId}`);
  revalidatePath("/leads");
  revalidatePath("/command-center");
  return { ok: true };
}
