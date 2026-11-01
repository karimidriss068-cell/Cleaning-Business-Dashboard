import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { GhlClient } from "@/lib/ghl/client";

// Test doubles for the GHL code: an in-memory stand-in for the Supabase client (tables are
// fixed row lists, rpc answers come from handlers, every write is recorded) and a GHL client
// whose methods are spies. Only used by tests.

type Row = Record<string, unknown>;
export type FakeLog = {
  rpc: { name: string; args: Record<string, unknown> }[];
  inserts: { table: string; row: Row }[];
  updates: { table: string; patch: Row }[];
};

export function fakeDb(opts: {
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  insertError?: Record<string, { code: string; message: string }>;
} = {}) {
  const log: FakeLog = { rpc: [], inserts: [], updates: [] };
  const builder = (table: string) => {
    const rows = opts.tables?.[table] ?? [];
    const self = {
      select: () => self,
      eq: () => self,
      order: () => self,
      limit: () => self,
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      insert: async (row: Row) => {
        log.inserts.push({ table, row });
        return { error: opts.insertError?.[table] ?? null };
      },
      update: (patch: Row) => {
        log.updates.push({ table, patch });
        return self;
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return self;
  };
  const db = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      log.rpc.push({ name, args });
      const handler = opts.rpc?.[name];
      return { data: handler ? handler(args) : null, error: null };
    },
  } as unknown as SupabaseClient<Database>;
  const calls = (name: string) => log.rpc.filter((c) => c.name === name);
  return { db, log, calls };
}

export function fakeClient(over: Partial<GhlClient> = {}) {
  const client: GhlClient = {
    locationId: "loc_test",
    getContact: vi.fn(async () => null),
    getMessage: vi.fn(async () => null),
    getOpportunity: vi.fn(async () => null),
    getAppointment: vi.fn(async () => null),
    opportunityForContact: vi.fn(async () => null),
    recentContacts: vi.fn(async () => []),
    recentOpportunities: vi.fn(async () => []),
    recentMessages: vi.fn(async () => []),
    updateOpportunity: vi.fn(async () => undefined),
    sendSms: vi.fn(async () => ({ messageId: "msg-sent-1" })),
    ...over,
  };
  return client;
}
