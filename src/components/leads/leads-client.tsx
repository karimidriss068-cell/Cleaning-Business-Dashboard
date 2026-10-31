"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LEAD_STAGES, planStageMove, stageLabel } from "@/lib/leads";
import type { LeadStage } from "@/lib/status";
import type { LeadRow, TeamMember } from "@/lib/leads-data";
import { moveLead } from "@/app/actions/leads";
import { StatusPill } from "@/components/system/status-pill";
import { leadTone } from "@/lib/status";
import { LeadCard } from "./lead-card";
import { LeadDrawer } from "./lead-drawer";
import { MoveSheet, type MoveState } from "./move-sheet";

const QUOTE_FOR_STAGE: Partial<Record<LeadStage, string>> = { quoted: "sent", won: "accepted", lost: "declined" };

function Column({ stage, count, children }: { stage: LeadStage; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      data-stage={stage}
      aria-label={`${stageLabel[stage]}, ${count} lead${count === 1 ? "" : "s"}`}
      className={cn(
        "flex min-h-[320px] min-w-0 flex-col rounded-md border border-hairline bg-surface/60 transition-colors duration-fast",
        isOver && "bg-brand/[0.06] shadow-[inset_0_0_0_1px_var(--kc-accent)]",
      )}
    >
      <h2 className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5">
        <StatusPill tone={leadTone(stage)}>{stageLabel[stage]}</StatusPill>
        <span className="text-[13px] text-ink-muted tabular">{count}</span>
      </h2>
      <div className="flex-1 space-y-2 p-2">{children}</div>
    </section>
  );
}

/**
 * The pipeline. Drag a card to another column (desktop) or use Move… on any
 * card; the stage changes at once and is restored if the server refuses.
 * Dropping on Lost asks why first. Phones get the same stages as a list.
 */
export function LeadsClient({ initialLeads, team, today, now, openId }: { initialLeads: LeadRow[]; team: TeamMember[]; today: string; now: string; openId: string | null }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [openLead, setOpenLead] = useState<string | null>(openId && initialLeads.some((l) => l.id === openId) ? openId : null);
  const [move, setMove] = useState<MoveState>(null);
  const [dragging, setDragging] = useState<{ id: string; width: number } | null>(null);
  const nowMs = useMemo(() => new Date(now).getTime(), [now]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byStage = useMemo(() => {
    const m = new Map<LeadStage, LeadRow[]>(LEAD_STAGES.map((s) => [s, []]));
    for (const l of leads) m.get(l.stage)?.push(l);
    return m;
  }, [leads]);
  const current = leads.find((l) => l.id === openLead) ?? null;

  const patch = (id: string, p: Partial<LeadRow>) => setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));

  async function commit(lead: LeadRow, stage: LeadStage, lostReason?: string) {
    const before = lead;
    const nowIso = new Date().toISOString();
    patch(lead.id, {
      stage,
      stageChangedAt: nowIso,
      lostReason: stage === "lost" ? (lostReason ?? null) : null,
      nextFollowUpOn: stage === "won" || stage === "lost" ? null : lead.nextFollowUpOn,
      quote: lead.quote && QUOTE_FOR_STAGE[stage] ? { ...lead.quote, status: QUOTE_FOR_STAGE[stage] as string } : lead.quote,
    });
    setMove(null);
    const res = await moveLead({ leadId: lead.id, expectedUpdatedAt: lead.updatedAt, stage, lostReason });
    if (res.ok) {
      patch(lead.id, { updatedAt: res.updatedAt });
      toast.success(`${lead.name} → ${stageLabel[stage]}`);
      return;
    }
    patch(lead.id, before); // roll back
    toast.error(res.code === "stale" ? "Lead changed by someone else" : "Couldn't move the lead", { description: res.message });
    if (res.code === "stale") router.refresh();
  }

  function planMove(lead: LeadRow, to: LeadStage) {
    const plan = planStageMove(lead.stage, to);
    if (plan.kind === "apply") void commit(lead, plan.stage);
    else if (plan.kind === "needs_reason") window.setTimeout(() => setMove({ lead, stage: "lost" }), 50);
  }

  function onDragStart(e: DragStartEvent) {
    const el = (e.activatorEvent.target as HTMLElement | null)?.closest<HTMLElement>("[data-lead-card]");
    setDragging({ id: String(e.active.id), width: el?.getBoundingClientRect().width ?? 240 });
  }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const lead = leads.find((l) => l.id === e.active.id);
    if (!lead || !e.over) return;
    planMove(lead, e.over.id as LeadStage);
  }

  const dragged = dragging ? leads.find((l) => l.id === dragging.id) : null;
  const card = (l: LeadRow, draggable: boolean) => (
    <LeadCard key={l.id} lead={l} today={today} nowMs={nowMs} draggable={draggable} dragging={dragging?.id === l.id} onOpen={(x) => setOpenLead(x.id)} onMove={(x) => setMove({ lead: x, stage: x.stage })} />
  );

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} autoScroll={false} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="hidden grid-cols-5 items-start gap-3 md:grid" data-testid="board">
          {LEAD_STAGES.map((s) => (
            <Column key={s} stage={s} count={byStage.get(s)?.length ?? 0}>
              {(byStage.get(s) ?? []).map((l) => card(l, true))}
              {(byStage.get(s)?.length ?? 0) === 0 && <p className="px-2 py-6 text-center text-[13px] text-ink-muted">Nothing here.</p>}
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged && dragging ? (
            <div style={{ width: dragging.width }} className="rotate-[0.6deg] cursor-grabbing shadow-e3">
              <LeadCard lead={dragged} today={today} nowMs={nowMs} draggable={false} onOpen={() => {}} onMove={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="space-y-5 md:hidden" data-testid="lead-list">
        {LEAD_STAGES.map((s) => (
          <section key={s} aria-label={stageLabel[s]}>
            <h2 className="mb-2 flex items-center justify-between px-1">
              <span className="font-heading text-lg font-medium text-ink">{stageLabel[s]}</span>
              <span className="text-[13px] text-ink-muted tabular">{byStage.get(s)?.length ?? 0}</span>
            </h2>
            <ul className="space-y-2">
              {(byStage.get(s) ?? []).map((l) => (
                <li key={l.id}>{card(l, false)}</li>
              ))}
              {(byStage.get(s)?.length ?? 0) === 0 && <li className="rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-muted">Nothing here.</li>}
            </ul>
          </section>
        ))}
      </div>

      <LeadDrawer lead={current} team={team} today={today} onClose={() => setOpenLead(null)} onMove={(l) => setMove({ lead: l, stage: l.stage })} onChanged={patch} />
      <MoveSheet state={move} onClose={() => setMove(null)} onSubmit={(l, s, r) => void commit(l, s, r)} />
    </>
  );
}
