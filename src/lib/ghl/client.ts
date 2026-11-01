import "server-only";
import { z } from "zod";
import {
  ghlAppointmentSchema, ghlContactSchema, ghlMessageSchema, ghlOpportunitySchema, unwrap,
  type GhlAppointment, type GhlContact, type GhlMessage, type GhlOpportunity,
} from "@/lib/ghl/schemas";

// Thin GoHighLevel API client for this business's own sub-account (never the MAKI one). The
// token and location id come from the environment and are read here and nowhere else; a
// response is parsed with zod before use and an error carries the status, never the body, so
// nothing from a contact reaches a log.

const DEFAULT_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

export type GhlConfig = { token: string; locationId: string; baseUrl?: string };

/** Tests point the client at a fake GHL on this machine with GHL_API_BASE; anything else is ignored. */
function testBase(): string | undefined {
  const base = process.env.GHL_API_BASE;
  return base && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base) ? base : undefined;
}

export function ghlConfig(): GhlConfig | null {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  return token && locationId ? { token, locationId, baseUrl: testBase() } : null;
}

export class GhlError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
  /** 429 and 5xx are worth retrying; a 4xx like 404 or 422 will not change. */
  get retryable(): boolean {
    return this.status === null || this.status === 429 || this.status >= 500;
  }
}

export type GhlClient = {
  locationId: string;
  getContact(id: string): Promise<GhlContact | null>;
  getMessage(id: string): Promise<GhlMessage | null>;
  getOpportunity(id: string): Promise<GhlOpportunity | null>;
  getAppointment(id: string): Promise<GhlAppointment | null>;
  opportunityForContact(contactId: string): Promise<GhlOpportunity | null>;
  recentContacts(since: Date, max: number): Promise<GhlContact[]>;
  recentOpportunities(since: Date, max: number): Promise<GhlOpportunity[]>;
  recentMessages(since: Date, max: number): Promise<GhlMessage[]>;
  updateOpportunity(id: string, patch: { pipelineStageId?: string; status?: "open" | "won" | "lost" }): Promise<void>;
  sendSms(contactId: string, message: string): Promise<{ messageId: string }>;
};

export function createGhlClient(config: GhlConfig, fetchImpl: typeof fetch = fetch): GhlClient {
  async function call(method: "GET" | "POST" | "PUT", path: string, opts: { query?: Record<string, string | number>; body?: unknown; allow404?: boolean } = {}): Promise<unknown> {
    const qs = opts.query ? `?${new URLSearchParams(Object.entries(opts.query).map(([k, v]) => [k, String(v)])).toString()}` : "";
    let res: Response;
    try {
      res = await fetchImpl(`${config.baseUrl ?? DEFAULT_BASE}${path}${qs}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Version: API_VERSION,
          Accept: "application/json",
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GhlError("GHL could not be reached", null);
    }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) throw new GhlError(`GHL answered ${res.status}`, res.status);
    return res.json().catch(() => null);
  }

  const loc = config.locationId;
  const newer = <T extends { dateUpdated?: string | null; dateAdded?: string | null }>(rows: T[], since: Date) =>
    rows.filter((r) => {
      const t = Date.parse(r.dateUpdated ?? r.dateAdded ?? "");
      return Number.isNaN(t) || t >= since.getTime();
    });

  return {
    locationId: loc,
    async getContact(id) {
      return unwrap(ghlContactSchema, "contact", await call("GET", `/contacts/${encodeURIComponent(id)}`, { allow404: true }));
    },
    async getMessage(id) {
      return unwrap(ghlMessageSchema, "message", await call("GET", `/conversations/messages/${encodeURIComponent(id)}`, { allow404: true }));
    },
    async getOpportunity(id) {
      return unwrap(ghlOpportunitySchema, "opportunity", await call("GET", `/opportunities/${encodeURIComponent(id)}`, { allow404: true }));
    },
    async getAppointment(id) {
      const json = await call("GET", `/calendars/events/appointments/${encodeURIComponent(id)}`, { allow404: true });
      return unwrap(ghlAppointmentSchema, "appointment", json) ?? unwrap(ghlAppointmentSchema, "event", json);
    },
    async opportunityForContact(contactId) {
      const json = await call("GET", "/opportunities/search", { query: { location_id: loc, locationId: loc, contact_id: contactId, contactId, limit: 5 } });
      const rows = z.object({ opportunities: z.array(ghlOpportunitySchema) }).safeParse(json);
      return rows.success ? (rows.data.opportunities[0] ?? null) : null;
    },
    async recentContacts(since, max) {
      const json = await call("POST", "/contacts/search", {
        body: { locationId: loc, pageLimit: Math.min(max, 100), page: 1, sort: [{ field: "dateUpdated", direction: "desc" }] },
      });
      const rows = z.object({ contacts: z.array(ghlContactSchema) }).safeParse(json);
      return rows.success ? newer(rows.data.contacts, since).slice(0, max) : [];
    },
    async recentOpportunities(since, max) {
      const json = await call("GET", "/opportunities/search", { query: { location_id: loc, locationId: loc, limit: Math.min(max, 100), order: "added_desc" } });
      const rows = z.object({ opportunities: z.array(ghlOpportunitySchema) }).safeParse(json);
      return rows.success ? newer(rows.data.opportunities, since).slice(0, max) : [];
    },
    async recentMessages(since, max) {
      const convs = z
        .object({ conversations: z.array(z.object({ id: z.string(), lastMessageDate: z.union([z.number(), z.string()]).nullish() }).passthrough()) })
        .safeParse(await call("GET", "/conversations/search", { query: { locationId: loc, sortBy: "last_message_date", sort: "desc", limit: 20 } }));
      if (!convs.success) return [];
      const out: GhlMessage[] = [];
      for (const c of convs.data.conversations) {
        const last = typeof c.lastMessageDate === "number" ? c.lastMessageDate : Date.parse(String(c.lastMessageDate ?? ""));
        if (!Number.isNaN(last) && last < since.getTime()) continue;
        const json = await call("GET", `/conversations/${encodeURIComponent(c.id)}/messages`, { query: { limit: 20 } });
        const list = z.object({ messages: z.union([z.array(ghlMessageSchema), z.object({ messages: z.array(ghlMessageSchema) })]) }).safeParse(json);
        if (!list.success) continue;
        const msgs = Array.isArray(list.data.messages) ? list.data.messages : list.data.messages.messages;
        out.push(...newer(msgs, since));
        if (out.length >= max) break;
      }
      return out.slice(0, max);
    },
    async updateOpportunity(id, patch) {
      await call("PUT", `/opportunities/${encodeURIComponent(id)}`, { body: patch });
    },
    async sendSms(contactId, message) {
      const json = await call("POST", "/conversations/messages", { body: { type: "SMS", contactId, message } });
      const parsed = z.object({ messageId: z.string().min(1) }).passthrough().safeParse(json);
      if (!parsed.success) throw new GhlError("GHL did not return a message id", null);
      return { messageId: parsed.data.messageId };
    },
  };
}
