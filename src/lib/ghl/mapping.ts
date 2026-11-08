import type { GhlContact, GhlOpportunity } from "@/lib/ghl/schemas";

// Pure mapping between GHL records and our rows. No I/O, so it is tested directly.

export type LeadStage = "new" | "site_visit" | "quoted" | "follow_up" | "won" | "lost";
export type StageIds = Partial<Record<LeadStage, string>>;
const STAGES: LeadStage[] = ["new", "site_visit", "quoted", "follow_up", "won", "lost"];

/** Our stage for a GHL opportunity: its won/lost status first, else its pipeline stage by the saved mapping. */
export function stageFromOpportunity(opp: Pick<GhlOpportunity, "status" | "pipelineStageId">, stageIds: StageIds): LeadStage | null {
  const status = (opp.status ?? "").toLowerCase();
  if (status === "won") return "won";
  if (status === "lost" || status === "abandoned") return "lost";
  if (!opp.pipelineStageId) return null;
  return STAGES.find((s) => stageIds[s] === opp.pipelineStageId) ?? null;
}

/** What to send GHL when one of our leads changes stage; null when that stage has no GHL stage saved. */
export function opportunityPatch(stage: LeadStage, stageIds: StageIds): { pipelineStageId?: string; status: "open" | "won" | "lost" } | null {
  const status = stage === "won" ? "won" : stage === "lost" ? "lost" : "open";
  const pipelineStageId = stageIds[stage];
  if (!pipelineStageId && status === "open") return null;
  return { ...(pipelineStageId ? { pipelineStageId } : {}), status };
}

export function parseStageIds(raw: unknown): StageIds {
  if (typeof raw !== "object" || raw === null) return {};
  const out: StageIds = {};
  for (const s of STAGES) {
    const v = (raw as Record<string, unknown>)[s];
    if (typeof v === "string" && v.length > 0) out[s] = v;
  }
  return out;
}

export const CONSENT_TAG = "sms-consent";

/** The consent tag and do-not-disturb flags of a GHL contact. A DND flag always wins over the tag. */
export function consentFlags(contact: Pick<GhlContact, "tags" | "dnd" | "dndSettings">): { smsConsent: boolean; dnd: boolean } {
  const dnd = contact.dnd || contact.dndSettings?.SMS?.status === "active" || contact.dndSettings?.sms?.status === "active";
  const tagged = contact.tags.some((t) => t.trim().toLowerCase() === CONSENT_TAG);
  return { smsConsent: tagged && !dnd, dnd };
}

export type Utm = { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };

/** UTM fields from the contact's first-touch attribution, else the first one it has. */
export function utmFromContact(contact: Pick<GhlContact, "attributions">): Utm {
  const a = contact.attributions.find((x) => x.isFirst) ?? contact.attributions[0];
  return {
    source: a?.utmSource ?? a?.source ?? null,
    medium: a?.utmMedium ?? a?.medium ?? null,
    campaign: a?.utmCampaign ?? a?.campaign ?? null,
    content: a?.utmContent ?? null,
    term: a?.utmTerm ?? null,
  };
}

export type ServiceType = "residential" | "recurring" | "move_out" | "commercial";
export function serviceFromTags(tags: string[]): ServiceType | null {
  const t = tags.map((x) => x.trim().toLowerCase());
  if (t.includes("commercial")) return "commercial";
  if (t.includes("move-out") || t.includes("move_out")) return "move_out";
  if (t.includes("recurring")) return "recurring";
  if (t.includes("residential")) return "residential";
  return null;
}
