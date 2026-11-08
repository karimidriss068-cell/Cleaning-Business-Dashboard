import { z } from "zod";
import { SPACE_TYPES } from "@/lib/schemas/pricing";

// What a bid is made of. Money is integer cents, shares are basis points; the database re-checks the cost
// lines and the margin floor on every save (save_bid_version), so these only keep bad input off the wire.

const uuid = z.string().uuid();
const cents = (max = 100_000_000_000) => z.number().int("Whole cents only").min(0).max(max);

export const bidAreaSchema = z.object({
  label: z.string().trim().min(1, "Name this area").max(80),
  spaceType: z.enum(SPACE_TYPES),
  sqft: z.number({ message: "Enter the square feet" }).int("Whole square feet").min(1, "Enter the square feet").max(5_000_000),
});

export const bidOverridesSchema = z.object({
  /** Replace the pricing rules' labor cost per cleaner-hour for this bid. */
  laborRateCents: cents(100_000).nullable().optional(),
  /** Replace supplies and equipment with a figure. */
  materialsCents: cents().nullable().optional(),
  marginTargetBps: z.number().int().min(0).max(9000).nullable().optional(),
  /** Charge this price instead of the suggested one. */
  priceCents: cents().nullable().optional(),
});

export const bidInputsSchema = z
  .object({
    areas: z.array(bidAreaSchema).min(1, "Add at least one area").max(40),
    cleans: z.number().int().min(1, "At least one clean").max(1000),
    crewSize: z.number().int().min(1).max(30),
    rush: z.boolean(),
    overrides: bidOverridesSchema.default({}),
    /** What the customer reads under the scope table. */
    scopeNotes: z.string().trim().max(4000).optional(),
  })
  .strict();
export type BidInputs = z.infer<typeof bidInputsSchema>;
export type BidArea = z.infer<typeof bidAreaSchema>;

export const costLineSchema = z.object({ label: z.string().trim().min(1).max(120), cents: cents(999_999_999_999) });

export const saveBidSchema = z.object({
  title: z.string().trim().min(1, "Give the bid a title").max(160),
  inputs: bidInputsSchema,
  expectedRulesVersion: z.number().int().min(1),
  bidId: uuid.optional(),
  leadId: uuid.optional(),
  companyName: z.string().trim().max(120).optional(),
  expectedVersion: z.number().int().min(0).optional(),
  floorOverrideReason: z.string().trim().min(3, "Say why this price is below the floor").max(500).optional(),
});

export const bidStatusSchema = z.object({
  bidId: uuid,
  status: z.enum(["ready", "draft", "sent"]),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const BID_STATUSES = ["draft", "ready", "sent", "won", "lost", "expired"] as const;
export type BidStatus = (typeof BID_STATUSES)[number];
