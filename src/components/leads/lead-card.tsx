"use client";

import { useDraggable } from "@dnd-kit/core";
import { ArrowRightLeft, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { followUpStatus, formatPhone, serviceTypeLabel, sourceLabel, stageLabel, type LeadSource } from "@/lib/leads";
import { leadTone, type LeadStage, type Tone } from "@/lib/status";
import type { LeadRow } from "@/lib/leads-data";
import { StatusPill } from "@/components/system/status-pill";

const stripe: Record<Tone, string> = {
  info: "bg-brand",
  secondary: "bg-accent2",
  success: "bg-success-fill",
  neutral: "bg-border-input",
  warning: "bg-warning-fill",
  danger: "bg-danger-fill",
};

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

/**
 * A lead on the board. The name opens the record, Move… opens the stage
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
  const src = lead.source ? (sourceLabel[lead.source as LeadSource] ?? lead.source) : "No source";
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
        "kc-settle relative rounded-md border glass-flat py-3 pr-3 pl-4 transition-[border-color,opacity] duration-base ease-standard hover:border-brand/35",
        draggable && "cursor-grab touch-none active:cursor-grabbing",
        dragging && "opacity-35",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-3 left-1.5 w-[3px] rounded-full", stripe[leadTone(lead.stage)])} />
      <button type="button" onClick={() => onOpen(lead)} className="block w-full min-w-0 rounded-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block truncate text-sm font-medium text-ink">{lead.name}</span>
        <span className="block truncate text-[13px] text-ink-muted">
          {serviceTypeLabel[lead.serviceType]}
          {lead.borough ? ` · ${lead.borough.replace("_", " ")}` : ""}
        </span>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-ink-muted">
        <span className="truncate">
          {src} · {ageLabel(lead.stageChangedAt, nowMs)} in stage
        </span>
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="inline-flex shrink-0 items-center gap-1 text-brand-text" aria-label={`Call ${lead.name} at ${formatPhone(lead.phone)}`} onPointerDown={(e) => e.stopPropagation()}>
            <Phone className="size-3.5" aria-hidden />
            <span className="tabular">{formatPhone(lead.phone)}</span>
          </a>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <FollowUpPill lead={lead} today={today} />
        <button
          type="button"
          onClick={() => onMove(lead)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Move ${lead.name}`}
          className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium text-ink-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:px-2"
        >
          <ArrowRightLeft className="size-3.5" aria-hidden /> Move…
        </button>
      </div>
    </article>
  );
}

export type { LeadStage };
