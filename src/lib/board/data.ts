import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { boardSessionRowSchema, type BoardSessionRow } from "@/lib/schemas/board";

type Db = SupabaseClient<Database>;

const COLUMNS = "id, created_at, question, advisors, rounds, use_context, status, advisor_outputs, synthesis, est_micros, cost_micros, logged_decision_id";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The last sessions, newest first. RLS returns rows to owner/admin only. */
export async function listBoardSessions(db: Db, limit = 20): Promise<BoardSessionRow[]> {
  const { data, error } = await db.from("board_sessions").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Loading sessions failed: ${error.message}`);
  return (data ?? []).flatMap((r) => {
    const p = boardSessionRowSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

export async function getBoardSession(db: Db, id: string): Promise<BoardSessionRow | null> {
  const { data, error } = await db.from("board_sessions").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Loading the session failed: ${error.message}`);
  if (!data) return null;
  const p = boardSessionRowSchema.safeParse(data);
  return p.success ? p.data : null;
}

/** A finished session with the same input from the last 24 hours. */
export async function findCachedSession(db: Db, hash: string, now: Date = new Date()): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from("board_sessions")
    .select("id")
    .eq("input_hash", hash)
    .eq("status", "done")
    .gte("created_at", new Date(now.getTime() - DAY_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Checking for a recent session failed: ${error.message}`);
  return data ? { id: data.id } : null;
}
