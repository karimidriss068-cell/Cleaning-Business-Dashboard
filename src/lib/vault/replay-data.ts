import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { addDays, nyDateString, nyDayRangeUtc } from "@/lib/format";
import type { Milestone } from "@/lib/growth";
import { channelLabel, CHANNELS, type Channel } from "@/lib/schemas/growth";
import { buildReplay, type ReplayFrame } from "./replay";

type Db = SupabaseClient<Database>;

const dailySchema = z.array(z.object({ day: z.string(), cents: z.number().int() }));
const channelSchema = z.array(z.object({ channel: z.string(), cents: z.number().int(), invoices: z.number().int() }));

export const REPLAY_FRAMES = 30;

/**
 * One frame per New York day for the last 30 days: revenue by the pace's own
 * definition (daily_revenue), visits booked and leads created that day, and the
 * pace against that month's milestone. Reaches back far enough to total a
 * month that began before the window.
 */
export async function loadReplay(db: Db, today: string, milestones: Milestone[]): Promise<ReplayFrame[]> {
  const first = addDays(today, -(REPLAY_FRAMES - 1));
  const monthStart = `${first.slice(0, 7)}-01`;
  const reach = Math.max(REPLAY_FRAMES, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${monthStart}T00:00:00Z`)) / 86400000) + 1);
  const [dailyRes, jobsRes, leadsRes] = await Promise.all([
    db.rpc("daily_revenue", { p_days: reach }),
    db.from("jobs").select("scheduled_start").neq("status", "cancelled").gte("scheduled_start", nyDayRangeUtc(first).start.toISOString()).lt("scheduled_start", nyDayRangeUtc(today).end.toISOString()).limit(5000),
    db.from("leads").select("created_at").gte("created_at", nyDayRangeUtc(first).start.toISOString()).limit(5000),
  ]);
  if (dailyRes.error) throw new Error(`Loading daily revenue failed: ${dailyRes.error.message}`);
  const daily = dailySchema.safeParse(dailyRes.data);
  if (!daily.success) throw new Error("Daily revenue had an unexpected shape");
  const bucket = (rows: { at: string }[]) => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const d = nyDateString(r.at);
      out[d] = (out[d] ?? 0) + 1;
    }
    return out;
  };
  return buildReplay({
    daily: daily.data,
    visitsByDay: bucket((jobsRes.data ?? []).map((j) => ({ at: j.scheduled_start }))),
    leadsByDay: bucket((leadsRes.data ?? []).map((l) => ({ at: l.created_at }))),
    milestones,
    frames: REPLAY_FRAMES,
  });
}

export type ChannelRevenue = { key: string; label: string; cents: number; invoices: number };

/** Revenue (before tax, after discount) of invoices issued in the last 90 days, by the channel of the contact's newest lead. */
export async function loadRevenueByChannel(db: Db): Promise<ChannelRevenue[]> {
  const { data, error } = await db.rpc("revenue_by_channel", { p_days: 90 });
  if (error) throw new Error(`Loading revenue by channel failed: ${error.message}`);
  const parsed = channelSchema.safeParse(data);
  if (!parsed.success) throw new Error("Revenue by channel had an unexpected shape");
  return parsed.data
    .filter((r) => r.cents > 0)
    .map((r) => ({
      key: r.channel,
      label: (CHANNELS as readonly string[]).includes(r.channel) ? channelLabel[r.channel as Channel] : "Other",
      cents: r.cents,
      invoices: r.invoices,
    }));
}
