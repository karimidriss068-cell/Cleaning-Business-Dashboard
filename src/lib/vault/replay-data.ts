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

export type ChannelStreamData = { weeks: string[]; series: { key: string; label: string; values: number[] }[] };

const weeklySchema = z.array(z.object({ week: z.string(), channel: z.string(), cents: z.number().int() }));
const mondayOf = (date: string) => {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
};

/** Revenue (before tax, after discount) of invoices issued in the last 13 weeks, per week and per channel (the channel of the contact's newest lead). */
export async function loadChannelStream(db: Db, today: string): Promise<ChannelStreamData> {
  const { data, error } = await db.rpc("revenue_by_channel_weekly", { p_days: 91 });
  if (error) throw new Error(`Loading revenue by channel failed: ${error.message}`);
  const parsed = weeklySchema.safeParse(data);
  if (!parsed.success) throw new Error("Revenue by channel had an unexpected shape");
  const weeks: string[] = [];
  for (let w = mondayOf(addDays(today, -90)); w <= today; w = addDays(w, 7)) weeks.push(w);
  const byChannel = new Map<string, number[]>();
  for (const r of parsed.data) {
    const key = (CHANNELS as readonly string[]).includes(r.channel) ? r.channel : "other";
    const i = weeks.indexOf(r.week);
    if (i < 0 || r.cents <= 0) continue;
    const arr = byChannel.get(key) ?? weeks.map(() => 0);
    arr[i] += r.cents;
    byChannel.set(key, arr);
  }
  return { weeks, series: [...byChannel].map(([key, values]) => ({ key, label: channelLabel[key as Channel], values })) };
}
