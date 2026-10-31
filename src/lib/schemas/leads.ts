import { z } from "zod";
import { BOROUGHS, SERVICE_TYPES, SOURCES, normalizeEmail, normalizeUsPhone } from "@/lib/leads";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const phoneField = z.preprocess(
  blank,
  z
    .string()
    .refine((v) => normalizeUsPhone(v) !== null, "That isn't a valid US phone number")
    .optional(),
);
const emailField = z.preprocess(blank, z.string().trim().email("That email address isn't valid").max(254).optional());

export const createLeadSchema = z
  .object({
    firstName: z.string().trim().min(1, "A first name is required").max(80),
    lastName: optionalText(80),
    phone: phoneField,
    email: emailField,
    serviceType: z.enum(SERVICE_TYPES),
    source: z.enum(SOURCES),
    borough: z.preprocess(blank, z.enum(BOROUGHS).optional()),
    addressLine1: optionalText(160),
    zip: z.preprocess(blank, z.string().regex(/^\d{5}$/, "Use a 5-digit ZIP").optional()),
    notes: optionalText(2000),
    nextFollowUpOn: z.preprocess(blank, day.optional()),
    allowDuplicate: z.boolean().default(false),
  })
  .refine((v) => v.phone || v.email, { message: "Add a phone number or an email", path: ["phone"] });
export type CreateLeadInput = z.input<typeof createLeadSchema>;

export const moveLeadSchema = z.object({
  leadId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  stage: z.enum(["new", "contacted", "quoted", "won", "lost"]),
  lostReason: z.preprocess(blank, z.string().trim().min(3, "Say briefly why").max(300).optional()),
});

export const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  patch: z
    .object({
      first_name: z.string().trim().min(1).max(80),
      last_name: z.string().trim().max(80).nullable(),
      phone: phoneField.nullable(),
      email: emailField.nullable(),
      address_line1: z.string().trim().max(160).nullable(),
      borough: z.enum(BOROUGHS).nullable(),
      zip: z.string().regex(/^\d{5}$/, "Use a 5-digit ZIP").nullable(),
      service_type: z.enum(SERVICE_TYPES),
      source: z.enum(SOURCES).nullable(),
      owner_id: z.string().uuid().nullable(),
      next_follow_up_on: day.nullable(),
      notes: z.string().trim().max(2000).nullable(),
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nothing to change"),
});

export const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  companyName: optionalText(120),
});

export const addNoteSchema = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(["note", "call", "sms", "email"]),
  direction: z.enum(["inbound", "outbound"]).optional(),
  body: z.string().trim().min(1, "Write something first").max(2000),
});

export const duplicateQuerySchema = z.object({ phone: z.string().max(40).optional(), email: z.string().max(254).optional() });

export type LeadActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: "invalid" | "stale" | "duplicate" | "not_allowed" | "forbidden" | "error"; message: string; duplicates?: DuplicateMatch[] };

export type DuplicateMatch = {
  contactId: string;
  name: string;
  phone: string | null;
  email: string | null;
  matched: string[];
  openLeadId: string | null;
  openLeadStage: string | null;
};

/** Maps the lead functions' SQLSTATEs to a code and a message safe to show. */
export function mapLeadError(error: { code?: string; message?: string; details?: string }): Extract<LeadActionResult, { ok: false }> {
  const message = error.message ?? "";
  switch (error.code) {
    case "KC001":
      return { ok: false, code: "stale", message: "Someone else changed this lead. It has been refreshed." };
    case "KC004":
      return { ok: false, code: "not_allowed", message };
    case "KC005":
      return { ok: false, code: "invalid", message };
    case "KC010":
      return { ok: false, code: "duplicate", message: "This looks like someone already in your contacts.", duplicates: parseDuplicates(error.details) };
    case "42501":
      return { ok: false, code: "forbidden", message: "Only office staff can change leads." };
    default:
      return { ok: false, code: "error", message: "That didn't work. Try again." };
  }
}

export function parseDuplicates(details: string | undefined): DuplicateMatch[] {
  try {
    const rows = JSON.parse(details ?? "[]") as Record<string, unknown>[];
    return rows.map((r) => ({
      contactId: String(r.contact_id),
      name: String(r.name ?? ""),
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      matched: (r.matched as string[]) ?? [],
      openLeadId: (r.open_lead_id as string | null) ?? null,
      openLeadStage: (r.open_lead_stage as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export { normalizeEmail };
