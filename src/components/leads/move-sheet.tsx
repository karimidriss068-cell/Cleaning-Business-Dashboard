"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { LEAD_STAGES, stageLabel } from "@/lib/leads";
import type { LeadStage } from "@/lib/status";
import type { LeadRow } from "@/lib/leads-data";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Drawer } from "@/components/system/drawer";

export type MoveState = { lead: LeadRow; stage: LeadStage } | null;

/** Move lead: pick the stage; Lost asks why. The keyboard and phone path for what dragging does. */
export function MoveSheet({ state, onClose, onSubmit }: { state: MoveState; onClose: () => void; onSubmit: (lead: LeadRow, stage: LeadStage, lostReason?: string) => void }) {
  return (
    <Drawer open={state !== null} onOpenChange={(o) => !o && onClose()} title="Move lead" description={state ? `${state.lead.name} · now ${stageLabel[state.lead.stage]}` : undefined}>
      {state && <MoveForm key={`${state.lead.id}:${state.stage}`} state={state} onClose={onClose} onSubmit={onSubmit} />}
    </Drawer>
  );
}

function MoveForm({ state, onClose, onSubmit }: { state: NonNullable<MoveState>; onClose: () => void; onSubmit: (lead: LeadRow, stage: LeadStage, lostReason?: string) => void }) {
  const { lead } = state;
  const [stage, setStage] = useState<LeadStage>(state.stage);
  const [reason, setReason] = useState(lead.lostReason ?? "");
  const lost = stage === "lost";
  const can = stage !== lead.stage && (!lost || reason.trim().length >= 3);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (can) onSubmit(lead, stage, lost ? reason.trim() : undefined);
      }}
    >
      <div role="radiogroup" aria-label="Stage" className="grid gap-2">
        {LEAD_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={stage === s}
            onClick={() => setStage(s)}
            className={cn(
              "flex h-11 items-center justify-between rounded-sm border px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              stage === s ? "border-brand bg-highlight text-ink" : "border-hairline bg-surface text-ink",
            )}
          >
            <span>{stageLabel[s]}</span>
            {s === lead.stage && <span className="text-[12px] text-ink-muted">current</span>}
          </button>
        ))}
      </div>
      {lost && (
        <div className="space-y-1.5">
          <Label htmlFor="lost-reason">Why was it lost? (required)</Label>
          <Textarea id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Went with a cheaper company" autoFocus />
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} className="h-11 sm:h-9">Cancel</Button>
        <Button type="submit" disabled={!can} className="h-11 sm:h-9">Move lead</Button>
      </div>
    </form>
  );
}
