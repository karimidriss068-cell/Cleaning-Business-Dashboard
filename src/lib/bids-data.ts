import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { bidInputsSchema, costLineSchema, BID_STATUSES, type BidInputs, type BidStatus } from "@/lib/schemas/bids";
import type { CostLine } from "@/lib/bids";
import type { LeadStage } from "@/lib/status";

export type BidVersionRow = {
  version: number;
  createdAt: string;
  inputs: BidInputs;
  costLines: CostLine[];
  costCents: number;
  priceCents: number;
  marginBps: number;
  rulesVersion: number;
  floorOverrideReason: string | null;
};
export type BidDetail = {
  id: string;
  number: number;
  title: string;
  status: BidStatus;
  currentVersion: number;
  validUntil: string | null;
  sentAt: string | null;
  updatedAt: string;
  leadId: string;
  leadStage: LeadStage;
  accountId: string;
  accountName: string;
  contact: { name: string; phone: string | null; email: string | null; address: string | null };
  versions: BidVersionRow[];
};

const costLines = z.array(costLineSchema);

/** One bid with every saved version, newest first; null when it doesn't exist or the caller can't read bids. */
export async function loadBid(supabase: SupabaseClient<Database>, id: string): Promise<BidDetail | null> {
  const { data, error } = await supabase
    .from("bids")
    .select(
      "id, bid_number, title, status, current_version, valid_until, sent_at, updated_at, lead_id, account_id, " +
        "account:accounts(name), lead:leads(stage), contact:contacts(first_name, last_name, phone, email, address_line1, zip, borough), " +
        "bid_versions(version, created_at, inputs, cost_lines, cost_cents, price_cents, margin_bps, rules_version, floor_override_reason)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Bid query failed: ${error.message}`);
  if (!data) return null;
  const b = data as unknown as {
    id: string; bid_number: number; title: string; status: string; current_version: number; valid_until: string | null; sent_at: string | null; updated_at: string;
    lead_id: string; account_id: string; account: { name: string } | null; lead: { stage: LeadStage } | null;
    contact: { first_name: string; last_name: string | null; phone: string | null; email: string | null; address_line1: string | null; zip: string | null; borough: string | null } | null;
    bid_versions: { version: number; created_at: string; inputs: unknown; cost_lines: unknown; cost_cents: number; price_cents: number; margin_bps: number; rules_version: number; floor_override_reason: string | null }[];
  };
  const status = z.enum(BID_STATUSES).parse(b.status);
  const address = [b.contact?.address_line1, b.contact?.borough ? b.contact.borough.replace("_", " ") : null, b.contact?.zip].filter(Boolean).join(", ");
  return {
    id: b.id,
    number: Number(b.bid_number),
    title: b.title,
    status,
    currentVersion: b.current_version,
    validUntil: b.valid_until,
    sentAt: b.sent_at,
    updatedAt: b.updated_at,
    leadId: b.lead_id,
    leadStage: b.lead?.stage ?? "new",
    accountId: b.account_id,
    accountName: b.account?.name ?? "Account",
    contact: { name: `${b.contact?.first_name ?? ""} ${b.contact?.last_name ?? ""}`.trim() || "Contact", phone: b.contact?.phone ?? null, email: b.contact?.email ?? null, address: address || null },
    versions: b.bid_versions
      .map<BidVersionRow>((v) => ({
        version: v.version,
        createdAt: v.created_at,
        inputs: bidInputsSchema.parse(v.inputs),
        costLines: costLines.parse(v.cost_lines),
        costCents: Number(v.cost_cents),
        priceCents: Number(v.price_cents),
        marginBps: v.margin_bps,
        rulesVersion: v.rules_version,
        floorOverrideReason: v.floor_override_reason,
      }))
      .sort((a, c) => c.version - a.version),
  };
}

export type BidLead = { id: string; name: string; stage: LeadStage; accountName: string | null; hasBid: string | null; serviceType: string | null };

/** The opportunity a new bid is for. */
export async function loadLeadForBid(supabase: SupabaseClient<Database>, leadId: string): Promise<BidLead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, stage, service_type, account:accounts(name), contact:contacts(first_name, last_name), bids(id, status)")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(`Lead query failed: ${error.message}`);
  if (!data) return null;
  const l = data as unknown as { id: string; stage: LeadStage; service_type: string | null; account: { name: string } | null; contact: { first_name: string; last_name: string | null } | null; bids: { id: string; status: string }[] };
  const open = l.bids.find((b) => b.status !== "lost" && b.status !== "expired");
  return { id: l.id, stage: l.stage, serviceType: l.service_type, accountName: l.account?.name ?? null, name: `${l.contact?.first_name ?? ""} ${l.contact?.last_name ?? ""}`.trim() || "Opportunity", hasBid: open?.id ?? null };
}
