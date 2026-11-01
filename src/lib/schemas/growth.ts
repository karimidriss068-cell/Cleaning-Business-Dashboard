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
  channel: z.string(),
  status: z.string(),
  isDemo: z.boolean(),
  spend30Cents: cents,
  leads30: count,
  booked30: count,
});
const spendRowSchema = z.object({ id: uuid, campaignId: uuid, campaign: z.string(), creative: z.string().nullable(), date: day, spendCents: cents, isDemo: z.boolean() });

const baseInputsSchema = z.object({
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

export const CHANNELS = ["meta", "google_search", "google_lsa", "referral", "organic", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const PAID_CHANNELS = ["meta", "google_search", "google_lsa"] as const;
export const channelLabel: Record<Channel, string> = {
  meta: "Meta",
  google_search: "Google Search",
  google_lsa: "Google LSA",
  referral: "Referral",
  organic: "Organic",
  other: "Other",
};
export const TIERS = ["base", "strong", "north_star"] as const;
export type TierKey = (typeof TIERS)[number];
export const EXPENSE_CATEGORIES = ["supplies", "equipment", "transit", "marketing", "software", "insurance", "other"] as const;

const tierSchema = z.enum(TIERS);
export const settingsExtraSchema = z.object({
  tier: tierSchema,
  tierBaseRevenueCents: cents,
  tierStrongRevenueCents: cents,
  tierNorthProfitCents: cents,
  monthlyChurnBps: z.number().int().min(0),
  cleansPerCrewPerWeek: z.number().int().min(1),
  testJudgeSpendCents: cents,
  testJudgeLeads: z.number().int().min(1),
  testLoserRatioX100: z.number().int().min(101),
  testDailyWeek1Cents: cents,
  testDailyAfterCents: cents,
  testWindowWeeks: z.number().int().min(1),
  testStartDate: day.nullable(),
});
export type SettingsExtra = z.infer<typeof settingsExtraSchema>;

const stageCounts = { leads: count, contacted: count, quoted: count, booked: count, firstClean: count, recurring: count, spendCents: cents };
const funnelRowSchema = z.object({ key: z.string(), name: z.string().optional(), channel: z.string().optional(), isDemo: z.boolean().optional(), ...stageCounts });
export type FunnelRow = z.infer<typeof funnelRowSchema>;
const bucketSchema = z.object({ leads: count, booked: count });
const monthSchema = z.object({
  monthStart: day,
  revenueCents: z.number().int(),
  adSpendCents: cents,
  subPayCents: cents.nullable(),
  otherCostsCents: cents.nullable(),
});
export type MonthRow = z.infer<typeof monthSchema>;
const windowSchema = z.object({ spendCents: cents, leads: count });

export const growthInputsSchema = baseInputsSchema.extend({
  settingsExtra: settingsExtraSchema,
  months: z.array(monthSchema),
  expenses: z
    .array(z.object({ id: uuid, category: z.string(), description: z.string(), amountCents: cents, date: day, isDemo: z.boolean() }))
    .nullable(),
  funnel: z.object({ channels: z.array(funnelRowSchema), campaigns: z.array(funnelRowSchema), creatives: z.array(funnelRowSchema) }),
  replyBuckets: z.object({ under5: bucketSchema, under60: bucketSchema, over60: bucketSchema, unanswered: count }),
  churn: z.array(z.object({ monthStart: day, startRecurring: count, cancellations: count })),
  channelTest: z.object({
    fromDate: day,
    channels: z.array(
      z.object({ key: z.string(), enabled: z.boolean(), spendCents: cents, leads: count, booked: count, recent: windowSchema, prior: windowSchema }),
    ),
  }),
  gateCriteria: z.array(z.object({ checkpoint: z.string(), metric: z.string(), threshold: cents, enabled: z.boolean() })),
  hireTriggers: z.array(z.object({ key: z.string(), label: z.string(), threshold: cents, enabled: z.boolean() })),
  decisions: z.array(z.object({ id: uuid, date: day, kind: z.string(), note: z.string(), decision: z.string() })),
  wonSincePlanStart: count,
  activeCrews: count,
  cashOnHandCents: z.number().int().nullable(),
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
export const adSpendSchema = z.object({
  campaignId: uuid,
  date: day,
  spendCents: z.number().int().min(0, "Enter zero or more").max(100_000_000),
  creative: z.string().trim().max(120).optional(),
});
export const campaignSchema = z.object({
  platform: z.enum(AD_PLATFORMS),
  name: z.string().trim().min(1, "Name the campaign").max(120),
  channel: z.enum(CHANNELS).optional(),
});
export const adSpendIdSchema = z.object({ id: uuid });

// Part 2 actions ---------------------------------------------------------------

export const tierSettingsSchema = z
  .object({
    tier: tierSchema,
    baseCents: z.number().int().min(1, "Enter an amount above zero").max(100_000_000_000),
    strongCents: z.number().int().min(1, "Enter an amount above zero").max(100_000_000_000),
    northProfitCents: z.number().int().min(1, "Enter an amount above zero").max(100_000_000_000),
  })
  .refine((v) => v.strongCents > v.baseCents, { message: "The strong tier must be above the base tier", path: ["strongCents"] });

export const forecastSchema = z.object({
  churnBps: z.number().int().min(0, "Between 0% and 100%").max(10000, "Between 0% and 100%"),
  cleansPerCrew: z.number().int().min(1, "At least 1").max(300, "At most 300"),
});

export const GATE_CHECKPOINTS = ["day30", "month3", "month6", "month9", "month12"] as const;
export const GATE_METRICS = ["channels_judged", "reply_minutes", "clients_booked", "month_revenue_cents", "cost_to_win_cents", "payback_tenths", "margin_bps", "base_tier_revenue"] as const;
export const gateCriteriaSchema = z.object({
  rows: z
    .array(z.object({ checkpoint: z.enum(GATE_CHECKPOINTS), metric: z.enum(GATE_METRICS), threshold: z.number().int().min(0, "Zero or more").max(100_000_000_000), enabled: z.boolean() }))
    .min(1)
    .max(40),
});

export const HIRE_KEYS = ["clients", "leads_per_week", "crews_short"] as const;
export const hireTriggersSchema = z.object({
  rows: z
    .array(z.object({ key: z.enum(HIRE_KEYS), label: z.string().trim().min(1, "Say what to do").max(120), threshold: z.number().int().min(0, "Zero or more").max(1_000_000), enabled: z.boolean() }))
    .min(1)
    .max(10),
});

export const DECISION_KINDS = ["general", "gate", "channel", "hire"] as const;
export const decisionSchema = z.object({
  date: day,
  kind: z.enum(DECISION_KINDS),
  note: z.string().trim().min(1, "Add a note").max(2000),
  decision: z.string().trim().min(1, "Say what you decided").max(300),
});
export const decisionIdSchema = z.object({ id: uuid });

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amountCents: z.number().int().min(1, "Enter an amount above zero").max(100_000_000),
  date: day,
  description: z.string().trim().max(200).optional(),
});
export const expenseIdSchema = z.object({ id: uuid });

export const channelTestSchema = z.object({
  judgeSpendCents: z.number().int().min(0).max(100_000_000_000),
  judgeLeads: z.number().int().min(1, "At least 1 lead").max(100_000),
  loserRatioX100: z.number().int().min(101, "Must be more than 1.0x").max(10_000),
  dailyWeek1Cents: z.number().int().min(0).max(100_000_000),
  dailyAfterCents: z.number().int().min(0).max(100_000_000),
  windowWeeks: z.number().int().min(1, "At least 1 week").max(26, "At most 26 weeks"),
  startDate: day.nullable(),
  channels: z.array(z.enum(PAID_CHANNELS)).max(3),
});
export const leadAttributionSchema = z.object({
  leadId: uuid,
  channel: z.enum(CHANNELS),
  creative: z.string().trim().max(120).optional(),
});
