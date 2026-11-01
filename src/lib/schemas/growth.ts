import { z } from "zod";

// Growth goal: the raw numbers the database gathers (growth_inputs) and the
// inputs of the owner/admin actions. Money is integer cents; dates are New York
// calendar dates (YYYY-MM-DD). The database re-checks every rule.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const uuid = z.string().uuid();
const count = z.number().int().min(0);
const cents = z.number().int().min(0).max(100_000_000_000);

export const growthSettingsSchema = z.object({
  startDate: day,
  residentialTargetCents: cents,
  commercialTargetCents: cents,
  resVisitPriceCents: cents,
  resVisitsPerMonth: z.number().int().min(1),
  commAccountValueCents: cents,
  closeRateBps: z.number().int().min(1),
  cacCents: cents,
  marginBps: z.number().int().min(1),
  monthlyAdBudgetCents: cents,
  replyTargetMinutes: z.number().int().min(1),
  cleansPerCleanerPerWeek: z.number().int().min(1),
  startingCapitalCents: cents,
  cashStartDate: day,
  monthlyFixedCostsCents: cents,
  minBufferCents: cents,
});
export type GrowthSettings = z.infer<typeof growthSettingsSchema>;

const campaignRowSchema = z.object({
  id: uuid,
  name: z.string(),
  platform: z.string(),
  status: z.string(),
  isDemo: z.boolean(),
  spend30Cents: cents,
  leads30: count,
  booked30: count,
});
const spendRowSchema = z.object({ id: uuid, campaignId: uuid, campaign: z.string(), date: day, spendCents: cents, isDemo: z.boolean() });

export const growthInputsSchema = z.object({
  today: day,
  monthStart: day,
  nextMonthStart: day,
  settings: growthSettingsSchema,
  milestones: z.array(z.object({ monthStart: day, targetCents: cents, actualCents: z.number().int() })),
  revenue: z.object({ monthCents: z.number().int(), prevMonthCents: z.number().int() }),
  clients: z.object({
    residentialActive: count,
    commercial: z.object({ accounts: count, visitsPerMonth: count, monthlyValueCents: cents }),
  }),
  leads: z.object({ last28: count, wonMonthResidential: count, wonMonthCommercial: count }),
  ads: z.object({
    spend30Cents: cents,
    spendMonthCents: cents,
    leads30: count,
    booked30: count,
    campaigns: z.array(campaignRowSchema),
    recent: z.array(spendRowSchema),
  }),
  reply: z.object({ medianMinutes: z.number().nullable(), sample: count }),
  capacity: z.object({ activeCleaners: count, scheduledNext7Days: count }),
  cash: z
    .object({
      collectedCents: z.number().int(),
      payoutsCents: cents,
      adSpendCents: cents,
      fixedMonths: count,
      last30: z.object({ collectedCents: z.number().int(), payoutsCents: cents, adSpendCents: cents }),
    })
    .nullable(),
  demo: z.object({ adSpend: z.boolean(), leads: z.boolean(), jobs: z.boolean(), invoices: z.boolean(), payments: z.boolean() }),
});
export type GrowthInputs = z.infer<typeof growthInputsSchema>;

// Actions ---------------------------------------------------------------------

export const planSchema = z
  .object({
    startDate: day,
    residentialCents: cents,
    commercialCents: cents,
    milestonesCents: z.array(cents).length(6, "Enter all six monthly milestones"),
  })
  .refine((v) => v.residentialCents + v.commercialCents > 0, { message: "Set a monthly goal above zero", path: ["residentialCents"] })
  .refine((v) => v.milestonesCents.every((m, i, a) => i === 0 || m >= a[i - 1]), {
    message: "Milestones should not go down from one month to the next",
    path: ["milestonesCents"],
  })
  .refine((v) => v.milestonesCents[5] === v.residentialCents + v.commercialCents, {
    message: "The last milestone must equal the monthly goal (residential plus commercial)",
    path: ["milestonesCents"],
  });

export const assumptionsSchema = z.object({
  visitPriceCents: z.number().int().min(1, "Enter a price above zero").max(10_000_000),
  visitsPerMonth: z.number().int().min(1, "At least 1").max(31, "At most 31"),
  accountValueCents: z.number().int().min(1, "Enter an amount above zero").max(100_000_000),
  closeRateBps: z.number().int().min(1, "Between 0.01% and 100%").max(10000, "Between 0.01% and 100%"),
  cacCents: z.number().int().min(0).max(10_000_000),
  marginBps: z.number().int().min(1, "Between 0.01% and 100%").max(10000, "Between 0.01% and 100%"),
  adBudgetCents: z.number().int().min(0).max(1_000_000_000),
  replyTargetMinutes: z.number().int().min(1, "At least 1 minute").max(1440),
  cleansPerCleaner: z.number().int().min(1, "At least 1").max(60, "At most 60"),
});

export const cashSchema = z.object({
  startingCents: cents,
  cashStartDate: day,
  fixedCents: cents,
  bufferCents: cents,
});

export const AD_PLATFORMS = ["meta", "google", "tiktok", "nextdoor", "yelp", "thumbtack", "other"] as const;
export const platformLabel: Record<(typeof AD_PLATFORMS)[number], string> = {
  meta: "Meta (Facebook/Instagram)",
  google: "Google",
  tiktok: "TikTok",
  nextdoor: "Nextdoor",
  yelp: "Yelp",
  thumbtack: "Thumbtack",
  other: "Other",
};
export const adSpendSchema = z.object({ campaignId: uuid, date: day, spendCents: z.number().int().min(0, "Enter zero or more").max(100_000_000) });
export const campaignSchema = z.object({ platform: z.enum(AD_PLATFORMS), name: z.string().trim().min(1, "Name the campaign").max(120) });
export const adSpendIdSchema = z.object({ id: uuid });
