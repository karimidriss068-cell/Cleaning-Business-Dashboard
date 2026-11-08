"use client";

import { useDraggable } from "@dnd-kit/core";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { followUpStatus, stageLabel } from "@/lib/leads";
import { bidDueState, winProbabilityBps } from "@/lib/pipeline";
import { formatCalendarDate, formatCents } from "@/lib/format";
import type { LeadStage } from "@/lib/status";
import type { LeadRow } from "@/lib/leads-data";
import { StatusPill } from "@/components/system/status-pill";

export function ageLabel(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function FollowUpPill({ lead, today }: { lead: Pick<LeadRow, "nextFollowUpOn" | "stage">; today: string }) {
  const f = followUpStatus(lead.nextFollowUpOn, lead.stage, today);
  if (f === "overdue") return <StatusPill tone="danger">Follow-up overdue</StatusPill>;
  if (f === "today") return <StatusPill tone="warning">Follow up today</StatusPill>;
  return null;
}

export function BidDuePill({ lead, today }: { lead: Pick<LeadRow, "bidDueOn" | "stage">; today: string }) {
  const d = bidDueState(lead.bidDueOn, lead.stage, today);
  if (d === "overdue") return <StatusPill tone="danger">Bid overdue</StatusPill>;
  if (d === "today") return <StatusPill tone="warning">Bid due today</StatusPill>;
  if (d === "soon") return <StatusPill tone="info">Bid due {formatCalendarDate(lead.bidDueOn)}</StatusPill>;
  return null;
}

/**
 * An opportunity on the pipeline. The name opens the record, Move… opens the stage
 * sheet (the keyboard and phone path); on desktop the card also drags.
 */
export function LeadCard({
  lead,
  today,
  nowMs,
  draggable,
  dragging,
  onOpen,
  onMove,
}: {
  lead: LeadRow;
  today: string;
  nowMs: number;
  draggable: boolean;
  dragging?: boolean;
  onOpen: (lead: LeadRow) => void;
  onMove: (lead: LeadRow) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id, data: { leadId: lead.id, stage: lead.stage }, disabled: !draggable });
  const closed = lead.stage === "won" || lead.stage === "lost";
  return (
    <article
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      role={undefined}
      tabIndex={undefined}
      aria-roledescription={undefined}
      data-lead-card={lead.id}
      aria-label={`${lead.name}, ${stageLabel[lead.stage]}`}
      className={cn(
        "kc-settle relative rounded-md border glass-flat p-3 transition-[border-color,opacity] duration-base ease-standard hover:border-brand/35",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        dragging && "opacity-35",
      )}
    >
      <button type="button" onClick={() => onOpen(lead)} className="block w-full min-w-0 rounded-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block truncate text-sm font-medium text-ink">{lead.accountName ?? lead.name}</span>
        <span className="block truncate text-[13px] text-ink-muted">{lead.accountName ? lead.name : lead.borough ? lead.borough.replace("_", " ") : "No site yet"}</span>
      </button>
      <p className="mt-2 flex items-baseline justify-between gap-2 text-[13px] text-ink-muted">
        <span className="tabular text-ink">{lead.expectedValueCents === null ? "No value yet" : formatCents(lead.expectedValueCents, { hideZeroCents: true })}</span>
        {!closed && lead.expectedValueCents !== null && <span className="tabular">{Math.round(winProbabilityBps(lead) / 100)}%</span>}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex flex-wrap items-center gap-1">
          <BidDuePill lead={lead} today={today} />
          <FollowUpPill lead={lead} today={today} />
        </span>
        <span className="text-[12px] text-ink-muted tabular">{ageLabel(lead.stageChangedAt, nowMs)}</span>
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={() => onMove(lead)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Move ${lead.name}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:px-2"
        >
          <ArrowRightLeft className="size-3.5" aria-hidden /> Move…
        </button>
      </div>
    </article>
  );
}

export type { LeadStage };
