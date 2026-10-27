"use client";

import { useMemo, useState } from "react";
import { OctagonX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNyDate, formatNyTime, nyWallClock, nyWallTimeToUtc } from "@/lib/format";
import { isBlocked, type CrewMember } from "@/lib/dispatch";
import { conflictsFor, defaultPeopleForCrew, type Proposal, type Roster } from "@/lib/dispatch-move";
import type { BoardVisit } from "@/lib/schedule-lanes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Drawer } from "@/components/system/drawer";

export type SheetState = { visit: BoardVisit; initial: Proposal } | null;

type Props = {
  state: SheetState;
  onClose: () => void;
  crews: { id: string; name: string }[];
  roster: Roster;
  crewMembers: { crewId: string; subcontractorId: string }[];
  visits: BoardVisit[];
  isAdmin: boolean;
  onSubmit: (visit: BoardVisit, proposal: Proposal, overrideReason?: string) => void;
};

/**
 * Move visit: crew, cleaners, date and time, with live conflict checks. This
 * is the drop-confirm on desktop, the keyboard "Move…" path (click or Enter on
 * a card) and the phone Reassign sheet. Blocks (double-booking, expired
 * insurance, inactive cleaner) need an admin's reason; warnings only inform.
 * The database re-checks everything when you submit.
 */
export function ReassignSheet(props: Props) {
  const { state, onClose } = props;
  return (
    <Drawer
      open={state !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Move visit"
      description={state ? `${state.visit.clientName} · ${state.visit.serviceName}` : undefined}
    >
      {state && <SheetForm key={`${state.visit.id}:${state.initial.start.toISOString()}:${state.initial.crewId}`} {...props} state={state} />}
    </Drawer>
  );
}

function SheetForm({ state, onClose, crews, roster, crewMembers, visits, isAdmin, onSubmit }: Props & { state: NonNullable<SheetState> }) {
  const { visit, initial } = state;
  const startClock = nyWallClock(initial.start);
  const [crewId, setCrewId] = useState<string>(initial.crewId ?? "none");
  const [personIds, setPersonIds] = useState<string[]>(initial.personIds);
  const [date, setDate] = useState(startClock.date);
  const [startTime, setStartTime] = useState(startClock.time);
  const [endTime, setEndTime] = useState(nyWallClock(initial.end).time);
  const [reason, setReason] = useState("");

  const people = useMemo(
    () => [...roster.values()].filter((p) => p.status === "active" || personIds.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [roster, personIds],
  );
  const wellFormed = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(startTime) && /^\d{2}:\d{2}$/.test(endTime);
  const start = wellFormed ? nyWallTimeToUtc(date, startTime) : initial.start;
  const end = wellFormed ? nyWallTimeToUtc(date, endTime) : initial.end;
  const validTime = wellFormed && end > start;
  const proposal: Proposal = { crewId: crewId === "none" ? null : crewId, personIds, start, end };
  const conflicts = useMemo(
    () => (validTime ? conflictsFor(visit, { crewId: crewId === "none" ? null : crewId, personIds, start, end }, visits, roster) : []),
    [validTime, visit, crewId, personIds, start, end, visits, roster],
  );
  const blocks = conflicts.filter((c) => c.severity === "block");
  const warns = conflicts.filter((c) => c.severity === "warn");
  const needsReason = isBlocked(conflicts);
  const canSubmit = validTime && (!needsReason || (isAdmin && reason.trim().length >= 3));
  const crewItems = [{ value: "none", label: "Unassigned" }, ...crews.map((c) => ({ value: c.id, label: c.name }))];
  const issuesFor = (p: CrewMember) => conflicts.filter((c) => c.subcontractorId === p.id);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(visit, proposal, needsReason ? reason.trim() : undefined);
      }}
    >
      <p className="text-[13px] text-ink-muted">
        Now: {formatNyDate(visit.start, "weekday")}, {formatNyTime(visit.start)}–{formatNyTime(visit.end)} · {visit.crewName ?? "Unassigned"}
        {visit.borough ? ` · ${visit.borough.replace("_", " ")}` : ""}
      </p>

      <div className="space-y-1.5">
        <Label>Crew</Label>
        <Select
          items={crewItems}
          value={crewId}
          onValueChange={(v) => {
            if (!v) return;
            setCrewId(v);
            setPersonIds(defaultPeopleForCrew(v === "none" ? null : v, crewMembers, roster));
          }}
        >
          <SelectTrigger className="h-11 w-full md:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {crewItems.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Cleaners</legend>
        <ul className="divide-y divide-hairline rounded-sm border border-hairline">
          {people.map((p) => {
            const checked = personIds.includes(p.id);
            const issues = checked ? issuesFor(p) : [];
            return (
              <li key={p.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => setPersonIds((ids) => (v ? [...ids, p.id] : ids.filter((id) => id !== p.id)))}
                    aria-label={p.name}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink">{p.name}</span>
                    {p.boroughs.length > 0 && <span className="block text-[12px] text-ink-muted capitalize">{p.boroughs.map((b) => b.replace("_", " ")).join(", ")}</span>}
                    {issues.map((c) => (
                      <span key={c.kind} className={cn("mt-0.5 flex items-start gap-1.5 text-[12px]", c.severity === "block" ? "text-danger" : "text-warning")}>
                        {c.severity === "block" ? <OctagonX className="mt-px size-3.5 shrink-0" aria-hidden /> : <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />}
                        <span>
                          {c.severity === "block" ? "Blocked: " : "Heads up: "}
                          {c.message}
                        </span>
                      </span>
                    ))}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="move-date">Date</Label>
          <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 md:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="move-start">Starts</Label>
          <Input id="move-start" type="time" step={900} value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-11 md:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="move-end">Ends</Label>
          <Input id="move-end" type="time" step={900} value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-11 md:h-9" aria-invalid={!validTime || undefined} />
        </div>
      </div>
      {!validTime && (
        <p role="alert" className="text-[13px] text-danger">
          The end time must be after the start time.
        </p>
      )}

      {(blocks.length > 0 || warns.length > 0) && (
        <div className="space-y-2 rounded-sm border border-hairline bg-surface-raised/60 p-3 text-sm" aria-live="polite">
          {blocks.length > 0 && (
            <p className="flex items-start gap-2 text-danger">
              <OctagonX className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">This move is blocked.</strong>{" "}
                {isAdmin ? "As an admin you can override with a reason; it's logged on the visit." : "Only an admin can override. Pick someone else or another time."}
              </span>
            </p>
          )}
          {warns.length > 0 && (
            <p className="flex items-start gap-2 text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {warns.length} heads-up{warns.length === 1 ? "" : "s"}: {warns.map((w) => w.message).join("; ")}.
              </span>
            </p>
          )}
        </div>
      )}

      {needsReason && isAdmin && (
        <div className="space-y-1.5">
          <Label htmlFor="override-reason">Override reason (required)</Label>
          <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Only cleaner free; insurance renewal in progress" />
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onClose} className="h-11 sm:h-9">
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit} variant={needsReason ? "danger" : "default"} className="h-11 sm:h-9">
          {needsReason ? "Override and move" : "Move visit"}
        </Button>
      </div>
    </form>
  );
}
