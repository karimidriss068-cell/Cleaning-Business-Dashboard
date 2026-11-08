"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { assignWorkDay, createProjectInvoice, deleteProjectCost, recordProjectCost, scheduleWorkDay, setAssignmentPay, setProjectStatus } from "@/app/actions/projects";
import { addDays, formatCalendarDate, formatCents, formatNyDate, formatNyTime, nyToday, nyWallTimeToUtc } from "@/lib/format";
import { dollarInputToCents } from "@/lib/pricing";
import { depositCents, finalCents } from "@/lib/projects";
import { COST_CATEGORIES, costCategoryLabel, milestoneLabel } from "@/lib/schemas/projects";
import { invoiceStatusLabel, projectLabel, projectTone, type InvoiceStatus } from "@/lib/status";
import type { CleanerOption, ProjectDetail } from "@/lib/projects-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { useFinanceAction } from "@/components/invoices/use-finance-action";

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
const money = (c: number) => formatCents(c, { hideZeroCents: true });
const costItems = COST_CATEGORIES.map((c) => ({ value: c, label: costCategoryLabel[c] }));

function Row({ label, value, strong, testId }: { label: string; value: React.ReactNode; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-medium" : ""}`}>
      <dt className={strong ? "text-ink" : "text-ink-muted"}>{label}</dt>
      <dd className="text-ink tabular" data-testid={testId}>{value}</dd>
    </div>
  );
}

/** A project: money and milestone invoices, work days and crew, project costs, and profit against the bid. */
export function ProjectView({ project, cleaners }: { project: ProjectDetail; cleaners: CleanerOption[] }) {
  const { run, pending } = useFinanceAction();
  const m = project.money;
  const open = project.status === "scheduled" || project.status === "in_progress";
  const [error, setError] = useState<string | null>(null);
  const fail = (msg: string) => setError(msg);
  const [progressAmount, setProgressAmount] = useState("");
  const [dayDate, setDayDate] = useState(() => addDays(nyToday(), 1));
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("16:00");
  const [dayNotes, setDayNotes] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [dayPay, setDayPay] = useState("");
  const [reason, setReason] = useState("");
  const [costCategory, setCostCategory] = useState<string>("supplies");
  const [costAmount, setCostAmount] = useState("");
  const [costDate, setCostDate] = useState(() => nyToday());
  const [costNote, setCostNote] = useState("");
  const [payEdits, setPayEdits] = useState<Record<string, string>>({});

  const hasDeposit = project.invoices.some((i) => i.milestone === "deposit");
  const hasFinal = project.invoices.some((i) => i.milestone === "final");

  function invoice(milestone: "deposit" | "progress" | "final") {
    setError(null);
    let amountCents: number | undefined;
    if (milestone === "progress") {
      const c = dollarInputToCents(progressAmount);
      if (c === null || c <= 0) return setError("Enter the progress payment in dollars, like 2500.");
      amountCents = c;
    }
    run(() => createProjectInvoice({ projectId: project.id, milestone, amountCents }), `${milestoneLabel[milestone]} invoice created as a draft`, () => setProgressAmount(""), fail);
  }
  function addDay() {
    setError(null);
    if (!/^\d{2}:\d{2}$/.test(dayStart) || !/^\d{2}:\d{2}$/.test(dayEnd)) return setError("Enter the start and end times.");
    run(() => scheduleWorkDay({ projectId: project.id, start: nyWallTimeToUtc(dayDate, dayStart).toISOString(), end: nyWallTimeToUtc(dayDate, dayEnd).toISOString(), notes: dayNotes || undefined }), "Work day added", () => setDayNotes(""), fail);
  }
  function assign(jobId: string, updatedAt: string) {
    setError(null);
    const pay = dayPay.trim() === "" ? undefined : dollarInputToCents(dayPay);
    if (pay === null) return setError("Enter the day's pay in dollars, like 220.");
    run(() => assignWorkDay({ projectId: project.id, jobId, expectedUpdatedAt: updatedAt, subcontractorIds: picked, payCents: pay, overrideReason: reason.trim() || undefined }), "Crew assigned", () => { setAssigning(null); setReason(""); }, fail);
  }
  function addCost() {
    setError(null);
    const c = dollarInputToCents(costAmount);
    if (c === null || c <= 0) return setError("Enter the cost in dollars, like 120.");
    run(() => recordProjectCost({ projectId: project.id, category: costCategory, amountCents: c, date: costDate, description: costNote || undefined }), "Cost recorded", () => { setCostAmount(""); setCostNote(""); }, fail);
  }
  const status = (to: "in_progress" | "completed" | "cancelled", msg: string) => run(() => setProjectStatus({ projectId: project.id, status: to, expectedUpdatedAt: project.updatedAt }), msg, undefined, fail);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <GlassPanel as="section" aria-labelledby="pj-money" className="space-y-4 p-5 md:p-6" data-testid="project-money">
          <h2 id="pj-money" className="font-heading text-lg font-medium text-ink">Money</h2>
          <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <Row label="Contract" value={money(m.contractCents)} testId="pj-contract" />
            <Row label="Invoiced" value={money(m.invoicedCents)} testId="pj-invoiced" />
            <Row label="Collected" value={money(m.collectedCents)} testId="pj-collected" />
            <Row label="Still to invoice" value={money(m.toInvoiceCents)} />
          </dl>
          {project.invoices.length > 0 && (
            <ul className="divide-y divide-hairline text-sm" data-testid="pj-invoices">
              {project.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <Link href={`/invoices/${i.id}`} className="font-medium text-brand-text underline">Invoice #{i.number}</Link>{" "}
                    <span className="text-ink-muted">{milestoneLabel[i.milestone]}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink tabular">{money(i.subtotalCents - i.discountCents)}</span>
                    <StatusPill tone={i.status === "paid" ? "success" : i.status === "draft" ? "neutral" : "info"}>{invoiceStatusLabel[i.status as InvoiceStatus] ?? i.status}</StatusPill>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {project.status !== "cancelled" && (
            <div className="space-y-3 border-t border-hairline pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <Button type="button" variant="secondary" onClick={() => invoice("deposit")} disabled={pending || hasDeposit} className="h-11 md:h-9" data-testid="pj-deposit">
                  Invoice the deposit ({money(depositCents(m.contractCents, project.depositBps))}, {pct(project.depositBps)})
                </Button>
                <Button type="button" variant="secondary" onClick={() => invoice("final")} disabled={pending || hasFinal || finalCents(m.contractCents, m.invoicedCents) === 0} className="h-11 md:h-9" data-testid="pj-final">
                  Invoice the final payment ({money(finalCents(m.contractCents, m.invoicedCents))})
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pj-progress" className="text-[12px] text-ink-muted">Progress payment ($)</Label>
                  <Input id="pj-progress" inputMode="decimal" value={progressAmount} onChange={(e) => setProgressAmount(e.target.value)} className="h-11 w-40 md:h-9" />
                </div>
                <Button type="button" variant="secondary" onClick={() => invoice("progress")} disabled={pending} className="h-11 md:h-9">Invoice a progress payment</Button>
              </div>
              <p className="text-[12px] text-ink-muted">Each makes a draft invoice you can edit and send from Invoices. Cleaners are paid once the final invoice is paid.</p>
            </div>
          )}
        </GlassPanel>

        <GlassPanel as="section" aria-labelledby="pj-days" className="space-y-4 p-5 md:p-6" data-testid="project-days">
          <h2 id="pj-days" className="font-heading text-lg font-medium text-ink">Work days and crew</h2>
          {project.days.length === 0 ? <p className="text-sm text-ink-muted">No work days yet.</p> : (
            <ul className="space-y-3">
              {project.days.map((d) => (
                <li key={d.jobId} className="space-y-2 rounded-md border border-hairline p-3 text-sm" data-testid="pj-day">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{formatNyDate(d.start, "weekday")} · {formatNyTime(d.start)} to {formatNyTime(d.end)}</span>
                    <StatusPill tone={d.status === "completed" ? "success" : d.status === "cancelled" ? "neutral" : "info"}>{d.status.replace("_", " ")}</StatusPill>
                  </div>
                  {d.notes && <p className="text-ink-muted">{d.notes}</p>}
                  {d.assignments.length === 0 ? <p className="text-ink-muted">No cleaners assigned.</p> : (
                    <ul className="space-y-1.5">
                      {d.assignments.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-ink">{a.name}</span>
                          <span className="flex items-center gap-2">
                            <Label htmlFor={`pay-${a.id}`} className="text-[12px] text-ink-muted">Pay ($)</Label>
                            <Input id={`pay-${a.id}`} inputMode="decimal" className="h-9 w-24" value={payEdits[a.id] ?? (a.payCents === null ? "" : String(a.payCents / 100))}
                              onChange={(e) => setPayEdits({ ...payEdits, [a.id]: e.target.value })} disabled={!open} />
                            <Button type="button" variant="ghost" size="sm" disabled={!open || pending || payEdits[a.id] === undefined} onClick={() => {
                              const c = dollarInputToCents(payEdits[a.id] ?? "");
                              if (c === null) return setError("Enter the day's pay in dollars, like 220.");
                              setError(null);
                              run(() => setAssignmentPay({ projectId: project.id, assignmentId: a.id, payCents: c }), "Pay saved", () => setPayEdits((p) => { const n = { ...p }; delete n[a.id]; return n; }), fail);
                            }}>Save pay</Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {open && d.status === "scheduled" && (assigning === d.jobId ? (
                    <div className="space-y-3 border-t border-hairline pt-3">
                      <fieldset className="space-y-1.5"><legend className="text-[12px] text-ink-muted">Cleaners for this day</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                          {cleaners.map((c) => (
                            <label key={c.id} className="flex items-center gap-2 text-ink"><input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} className="size-4 accent-[var(--kc-accent)]" />{c.name}</label>
                          ))}
                          {cleaners.length === 0 && <span className="text-ink-muted">No active cleaners yet.</span>}
                        </div>
                      </fieldset>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5"><Label htmlFor="pj-daypay" className="text-[12px] text-ink-muted">Pay each cleaner for the day ($)</Label><Input id="pj-daypay" inputMode="decimal" value={dayPay} onChange={(e) => setDayPay(e.target.value)} className="h-11 md:h-9" /></div>
                        <div className="space-y-1.5"><Label htmlFor="pj-reason" className="text-[12px] text-ink-muted">Reason to assign despite a conflict (optional)</Label><Input id="pj-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 md:h-9" /></div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" onClick={() => assign(d.jobId, d.updatedAt)} disabled={pending} className="h-11 md:h-9">Assign</Button>
                        <Button type="button" variant="ghost" onClick={() => setAssigning(null)} className="h-11 md:h-9">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button type="button" variant="secondary" size="sm" onClick={() => { setAssigning(d.jobId); setPicked(d.assignments.map((a) => a.subcontractorId)); setDayPay(d.assignments[0]?.payCents != null ? String(d.assignments[0].payCents / 100) : ""); setReason(""); }} data-testid="pj-assign">
                      {d.assignments.length ? "Change crew" : "Assign cleaners"}
                    </Button>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {open && (
            <div className="space-y-3 border-t border-hairline pt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="pj-day-date" className="text-[12px] text-ink-muted">Date</Label><Input id="pj-day-date" type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className="h-11 md:h-9" /></div>
                <div className="space-y-1.5"><Label htmlFor="pj-day-start" className="text-[12px] text-ink-muted">Start</Label><Input id="pj-day-start" type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="h-11 md:h-9" /></div>
                <div className="space-y-1.5"><Label htmlFor="pj-day-end" className="text-[12px] text-ink-muted">End</Label><Input id="pj-day-end" type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="h-11 md:h-9" /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="pj-day-notes" className="text-[12px] text-ink-muted">Notes for the crew (optional)</Label><Textarea id="pj-day-notes" value={dayNotes} onChange={(e) => setDayNotes(e.target.value)} /></div>
              <Button type="button" variant="secondary" onClick={addDay} disabled={pending} className="h-11 md:h-9" data-testid="pj-add-day"><Plus aria-hidden /> Add a work day</Button>
            </div>
          )}
        </GlassPanel>

        <GlassPanel as="section" aria-labelledby="pj-costs" className="space-y-4 p-5 md:p-6" data-testid="project-costs">
          <h2 id="pj-costs" className="font-heading text-lg font-medium text-ink">Project costs</h2>
          <p className="text-[13px] text-ink-muted">Supplies, equipment and travel for this project. Cleaner pay is counted from the work days, so don&apos;t enter it here.</p>
          {project.costs.length > 0 && (
            <ul className="divide-y divide-hairline text-sm">
              {project.costs.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span><span className="text-ink">{c.description}</span> <span className="text-ink-muted">{costCategoryLabel[c.category as keyof typeof costCategoryLabel] ?? c.category} · {formatCalendarDate(c.incurredOn)}</span></span>
                  <span className="flex items-center gap-2"><span className="text-ink tabular">{money(c.amountCents)}</span>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${c.description}`} onClick={() => run(() => deleteProjectCost({ projectId: project.id, id: c.id }), "Cost deleted", undefined, fail)} disabled={pending}><Trash2 aria-hidden /></Button></span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5"><Label className="text-[12px] text-ink-muted">Kind</Label>
              <Select items={costItems} value={costCategory} onValueChange={(v) => v && setCostCategory(v)}>
                <SelectTrigger className="h-11 w-full md:h-9" aria-label="Kind of cost"><SelectValue /></SelectTrigger>
                <SelectContent>{costItems.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label htmlFor="pj-cost-amt" className="text-[12px] text-ink-muted">Amount ($)</Label><Input id="pj-cost-amt" inputMode="decimal" value={costAmount} onChange={(e) => setCostAmount(e.target.value)} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="pj-cost-date" className="text-[12px] text-ink-muted">Date</Label><Input id="pj-cost-date" type="date" value={costDate} max={nyToday()} onChange={(e) => setCostDate(e.target.value)} className="h-11 md:h-9" /></div>
            <div className="space-y-1.5"><Label htmlFor="pj-cost-note" className="text-[12px] text-ink-muted">What for</Label><Input id="pj-cost-note" value={costNote} onChange={(e) => setCostNote(e.target.value)} className="h-11 md:h-9" /></div>
          </div>
          <Button type="button" variant="secondary" onClick={addCost} disabled={pending} className="h-11 md:h-9" data-testid="pj-add-cost"><Plus aria-hidden /> Add a cost</Button>
        </GlassPanel>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Profit and status">
        <GlassPanel as="section" aria-label="Profit" className="space-y-3 p-5" data-testid="project-profit">
          <div className="flex items-center gap-2"><StatusPill tone={projectTone(project.status)}>{projectLabel[project.status]}</StatusPill><span className="text-[13px] text-ink-muted">Project {project.number}</span></div>
          <h2 className="font-heading text-base font-medium text-ink">Profit: bid against actual</h2>
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-ink-muted"><th className="py-1 font-medium"><span className="sr-only">Line</span></th><th className="py-1 text-right font-medium">Bid</th><th className="py-1 text-right font-medium">Actual</th></tr></thead>
            <tbody className="tabular">
              <tr><th scope="row" className="py-1 text-left font-normal text-ink-muted">Price</th><td className="py-1 text-right text-ink">{money(m.contractCents)}</td><td className="py-1 text-right text-ink">{money(m.contractCents)}</td></tr>
              <tr><th scope="row" className="py-1 text-left font-normal text-ink-muted">Labor</th><td className="py-1 text-right text-ink-muted">·</td><td className="py-1 text-right text-ink" data-testid="pj-labor">{money(m.laborCents)}</td></tr>
              <tr><th scope="row" className="py-1 text-left font-normal text-ink-muted">Other costs</th><td className="py-1 text-right text-ink-muted">·</td><td className="py-1 text-right text-ink" data-testid="pj-other">{money(m.otherCostsCents)}</td></tr>
              <tr><th scope="row" className="py-1 text-left font-medium text-ink">Total cost</th><td className="py-1 text-right text-ink">{money(m.bidCostCents)}</td><td className="py-1 text-right text-ink" data-testid="pj-cost">{money(m.actualCostCents)}</td></tr>
              <tr><th scope="row" className="py-1 text-left font-medium text-ink">Profit</th><td className="py-1 text-right text-ink">{money(m.bidProfitCents)}</td><td className="py-1 text-right text-ink" data-testid="pj-profit">{money(m.actualProfitCents)}</td></tr>
              <tr><th scope="row" className="py-1 text-left font-medium text-ink">Margin</th><td className="py-1 text-right text-ink">{pct(m.bidMarginBps)}</td><td className="py-1 text-right text-ink" data-testid="pj-margin">{pct(m.actualMarginBps)}</td></tr>
            </tbody>
          </table>
          <p className="text-[12px] text-ink-muted" data-testid="pj-variance">
            {m.costVarianceCents > 0 ? `${money(m.costVarianceCents)} over the bid's cost.` : m.costVarianceCents < 0 ? `${money(-m.costVarianceCents)} under the bid's cost${project.status === "completed" ? "" : " so far; more costs may still come"}.` : "Exactly on the bid's cost."}
            {" "}Direct profit: your selling time and overhead aren&apos;t included.
          </p>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        </GlassPanel>

        <GlassPanel as="section" aria-label="Status" className="space-y-3 p-5">
          <h2 className="font-heading text-base font-medium text-ink">Status</h2>
          <dl className="space-y-1 text-[13px]">
            <Row label="Site" value={project.address ?? "No address"} />
            <Row label="Planned" value={project.startsOn ? `${formatCalendarDate(project.startsOn)}${project.endsOn ? ` to ${formatCalendarDate(project.endsOn)}` : ""}` : "No dates yet"} />
            <Row label="From" value={<Link href={`/bids/${project.bidId}`} className="text-brand-text underline">Bid {project.bidNumber}, version {project.bidVersion}</Link>} />
          </dl>
          {project.status === "scheduled" && <Button type="button" onClick={() => status("in_progress", "Project started")} disabled={pending} className="h-11 w-full md:h-9" data-testid="pj-start">Start the project</Button>}
          {project.status === "in_progress" && <Button type="button" onClick={() => status("completed", "Project completed")} disabled={pending} className="h-11 w-full md:h-9" data-testid="pj-complete">Mark completed</Button>}
          {project.status === "completed" && <Button type="button" variant="secondary" onClick={() => status("in_progress", "Project reopened")} disabled={pending} className="h-11 w-full md:h-9">Reopen</Button>}
          {open && <Button type="button" variant="ghost" onClick={() => status("cancelled", "Project cancelled")} disabled={pending} className="h-11 w-full md:h-9">Cancel the project</Button>}
        </GlassPanel>
      </aside>
    </div>
  );
}
