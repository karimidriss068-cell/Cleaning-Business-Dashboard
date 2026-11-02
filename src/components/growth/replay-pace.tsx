"use client";

import { paceLabel, paceTone, type Tone } from "@/lib/status";
import type { PaceStatus } from "@/lib/growth";
import { AnimatedNumber } from "@/components/system/animated-number";
import { Meter } from "@/components/system/meter";
import { StatusPill } from "@/components/system/status-pill";
import { useReplay } from "@/components/vault/replay";
import { longDate, money, monthLabel, paceSentence } from "./format";

export type LivePace = {
  before: boolean;
  phase: string;
  status: PaceStatus;
  daysAhead: number;
  monthStart: string;
  revenueCents: number;
  milestoneCents: number;
  expectedToDateCents: number;
  daysUntilStart: number;
  startDate: string;
  goalReached: { monthStart: string; monthsEarly: number } | null;
};

/** The pace pill: today's status, or the status on the replay day while someone scrubs. */
export function PacePill({ pace }: { pace: LivePace }) {
  const r = useReplay();
  if (r && !r.live) {
    const p = r.frames[r.index].pace;
    return p ? <StatusPill tone={paceTone[p.status]}>{paceLabel[p.status]}</StatusPill> : <StatusPill tone="neutral">No plan month</StatusPill>;
  }
  return pace.before ? <StatusPill tone="neutral">Starts {longDate(pace.startDate)}</StatusPill> : <StatusPill tone={paceTone[pace.status] as Tone}>{paceLabel[pace.status]}</StatusPill>;
}

/** The revenue column of the growth card; the number, meter and sentence follow the replay day. */
export function RevenueColumn({ pace }: { pace: LivePace }) {
  const r = useReplay();
  const replaying = r !== null && !r.live;
  const f = replaying ? r.frames[r.index] : null;
  const revenue = f ? f.monthToDateCents : pace.revenueCents;
  const milestone = f ? (f.pace?.milestoneCents ?? 0) : pace.milestoneCents;
  const expected = f ? (f.pace?.expectedCents ?? 0) : pace.expectedToDateCents;
  const status = f?.pace?.status ?? pace.status;
  const daysAhead = f?.pace?.daysAhead ?? pace.daysAhead;
  const before = f ? !f.pace : pace.before;
  const month = f ? `${f.date.slice(0, 7)}-01` : pace.monthStart;
  const share = milestone > 0 ? revenue / milestone : 0;
  const expectedShare = milestone > 0 ? expected / milestone : 0;
  return (
    <div className="min-w-0 space-y-2" data-testid="growth-revenue" data-replaying={replaying || undefined}>
      <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Revenue, {monthLabel(month)}</p>
      <p className="font-heading text-[32px] leading-9 font-medium tracking-[-0.02em] text-ink tabular">
        <AnimatedNumber value={Math.round(revenue / 100) * 100} kind="cents" hideZeroCents />
      </p>
      <Meter value={share} marker={before ? undefined : expectedShare} tone={before ? "neutral" : paceTone[status]} label="Revenue against this month's milestone" />
      <p className="text-[13px] text-ink-muted tabular">
        {before
          ? replaying
            ? "No plan month covers this day."
            : `Month 1 asks for ${money(pace.milestoneCents)}. ${pace.daysUntilStart} days to go.`
          : `of ${money(milestone)} milestone · ${paceSentence(daysAhead)}`}
      </p>
      {!replaying && pace.goalReached && (
        <p className="text-[13px] font-medium text-success">
          Full goal reached in {monthLabel(pace.goalReached.monthStart)}
          {pace.goalReached.monthsEarly > 0 ? `, ${pace.goalReached.monthsEarly} month${pace.goalReached.monthsEarly === 1 ? "" : "s"} early` : ""}.
        </p>
      )}
    </div>
  );
}
