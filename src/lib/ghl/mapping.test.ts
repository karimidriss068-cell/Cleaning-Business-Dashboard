import { describe, expect, it } from "vitest";
import { ghlContactSchema } from "./schemas";
import { consentFlags, opportunityPatch, parseStageIds, serviceFromTags, stageFromOpportunity, utmFromContact } from "./mapping";

const ids = { new: "s-new", contacted: "s-con", quoted: "s-quo", won: "s-won", lost: "s-lost" };
const contact = (extra: object) => ghlContactSchema.parse({ id: "c1", ...extra });

describe("stages", () => {
  it("maps a pipeline stage to ours and prefers won/lost status", () => {
    expect(stageFromOpportunity({ status: "open", pipelineStageId: "s-quo" }, ids)).toBe("quoted");
    expect(stageFromOpportunity({ status: "won", pipelineStageId: "s-new" }, ids)).toBe("won");
    expect(stageFromOpportunity({ status: "abandoned", pipelineStageId: null }, ids)).toBe("lost");
  });
  it("returns null for a stage that isn't mapped", () => {
    expect(stageFromOpportunity({ status: "open", pipelineStageId: "other" }, ids)).toBeNull();
    expect(stageFromOpportunity({ status: "open", pipelineStageId: null }, ids)).toBeNull();
    expect(stageFromOpportunity({ status: "open", pipelineStageId: "s-quo" }, {})).toBeNull();
  });
  it("builds the update for GHL, with won and lost as statuses", () => {
    expect(opportunityPatch("quoted", ids)).toEqual({ pipelineStageId: "s-quo", status: "open" });
    expect(opportunityPatch("won", ids)).toEqual({ pipelineStageId: "s-won", status: "won" });
    expect(opportunityPatch("lost", { won: "s-won" })).toEqual({ status: "lost" });
    expect(opportunityPatch("site_visit", {})).toBeNull();
  });
  it("keeps only known stages with string ids", () => {
    expect(parseStageIds({ new: "a", won: 5, bogus: "x", lost: "" })).toEqual({ new: "a" });
    expect(parseStageIds(null)).toEqual({});
  });
});

describe("consent", () => {
  it("needs the tag", () => {
    expect(consentFlags(contact({}))).toEqual({ smsConsent: false, dnd: false });
    expect(consentFlags(contact({ tags: ["SMS-Consent"] }))).toEqual({ smsConsent: true, dnd: false });
  });
  it("do-not-disturb beats the tag, whichever field says it", () => {
    expect(consentFlags(contact({ tags: ["sms-consent"], dnd: true }))).toEqual({ smsConsent: false, dnd: true });
    expect(consentFlags(contact({ tags: ["sms-consent"], dndSettings: { SMS: { status: "active" } } }))).toEqual({ smsConsent: false, dnd: true });
    expect(consentFlags(contact({ tags: ["sms-consent"], dndSettings: { SMS: { status: "inactive" } } })).smsConsent).toBe(true);
  });
});

describe("attribution and service", () => {
  it("takes the first-touch attribution, else the first, with source fallbacks", () => {
    const c = contact({ attributions: [{ utmSource: "later" }, { utmSource: "facebook", utmCampaign: "Spring", utmContent: "Reel A", isFirst: true }] });
    expect(utmFromContact(c)).toMatchObject({ source: "facebook", campaign: "Spring", content: "Reel A" });
    expect(utmFromContact(contact({ attributions: [{ source: "Google Ads", campaign: "LSA" }] }))).toMatchObject({ source: "Google Ads", campaign: "LSA" });
    expect(utmFromContact(contact({}))).toEqual({ source: null, medium: null, campaign: null, content: null, term: null });
  });
  it("reads the service type from tags", () => {
    expect(serviceFromTags(["Commercial", "x"])).toBe("commercial");
    expect(serviceFromTags(["move-out"])).toBe("move_out");
    expect(serviceFromTags(["vip"])).toBeNull();
  });
});
