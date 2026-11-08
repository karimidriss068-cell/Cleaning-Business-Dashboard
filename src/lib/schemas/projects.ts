import { z } from "zod";

// Inputs of the owner/admin project actions. Money is integer cents; the database checks every rule again.

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date");
const dollars = (max: number, msg: string) => z.number({ message: msg }).int(msg).min(0, msg).max(max, msg);

export const PROJECT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const MILESTONES = ["deposit", "progress", "final"] as const;
export type Milestone = (typeof MILESTONES)[number];
export const milestoneLabel: Record<Milestone, string> = { deposit: "Deposit", progress: "Progress payment", final: "Final payment" };

export const createProjectSchema = z
  .object({
    bidId: uuid,
    expectedUpdatedAt: timestamp,
    title: z.string().trim().max(160).optional(),
    depositBps: z.number().int().min(0, "Between 0% and 100%").max(10000, "Between 0% and 100%").default(3000),
    startsOn: day.optional(),
    endsOn: day.optional(),
  })
  .refine((v) => !v.startsOn || !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "The end can't be before the start" });

export const projectStatusSchema = z.object({ projectId: uuid, status: z.enum(["in_progress", "completed", "cancelled"]), expectedUpdatedAt: timestamp });

export const projectInvoiceSchema = z
  .object({ projectId: uuid, milestone: z.enum(MILESTONES), amountCents: dollars(1_000_000_000, "Enter an amount in dollars").optional() })
  .refine((v) => v.milestone !== "progress" || (v.amountCents !== undefined && v.amountCents > 0), { path: ["amountCents"], message: "Enter the amount for a progress payment" });

export const workDaySchema = z
  .object({ projectId: uuid, start: timestamp, end: timestamp, notes: z.string().trim().max(2000).optional() })
  .refine((v) => new Date(v.end) > new Date(v.start), { path: ["end"], message: "The day must end after it starts" });

export const assignDaySchema = z.object({
  jobId: uuid,
  expectedUpdatedAt: timestamp,
  subcontractorIds: z.array(uuid).max(30),
  payCents: dollars(100_000_000, "Enter the day's pay in dollars").optional(),
  overrideReason: z.string().trim().min(3, "Say why").max(300).optional(),
});

export const assignmentPaySchema = z.object({ assignmentId: uuid, payCents: dollars(100_000_000, "Enter the day's pay in dollars") });

export const COST_CATEGORIES = ["supplies", "equipment", "transit", "software", "insurance", "other"] as const;
export const costCategoryLabel: Record<(typeof COST_CATEGORIES)[number], string> = {
  supplies: "Supplies", equipment: "Equipment", transit: "Travel", software: "Software", insurance: "Insurance", other: "Other",
};
export const projectCostSchema = z.object({
  projectId: uuid,
  category: z.enum(COST_CATEGORIES),
  amountCents: z.number({ message: "Enter an amount in dollars" }).int().min(1, "Enter an amount above zero").max(100_000_000, "That's too large"),
  date: day,
  description: z.string().trim().max(200).optional(),
});
export const deleteCostSchema = z.object({ id: uuid });
