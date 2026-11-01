"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { addDecision, deleteDecision, saveGateCriteria, saveHireTriggers } from "@/app/actions/growth";
import { formatCalendarDate, formatCents, parseDollarsToCents } from "@/lib/format";
import { gateMetricInfo, type CriterionResult, type GateResult, type GateStatus, type HireTrigger } from "@/lib/growth-plan";
import { bpsToPercent } from "@/lib/growth";
import { DECISION_KINDS, decisionSchema, gateCriteriaSchema, hireTriggersSchema } from "@/lib/schemas/growth";
import type { GrowthSnapshot } from "@/lib/growth-snapshot";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";
import { fieldErrors, useFinanceAction } from "@/components/invoices/use-finance-action";
import type { Tone } from "@/lib/status";

const gateTone: Record<GateStatus, Tone> = { passed: "success", on_track: "info", missed: "danger" };
const gateText: Record<GateStatus, string> = { passed: "Passed", on_track: "On track", missed: "Missed" };
const critTone: Record<CriterionResult["state"], Tone> = { met: "success", pending: "info", missed: "danger", unknown: "neutral" };
const critText: Record<CriterionResult["state"], string> = { met: "Met", pending: "Not yet", missed: "Missed", unknown: "No data" };

type Unit = (typeof gateMetricInfo)[keyof typeof gateMetricInfo]["unit"];
function show(unit: Unit, v: number): string {
  switch (unit) {
    case "cents":
    case "tier":
      return formatCents(Math.round(v / 100) * 100, { hideZeroCents: true });
    case "minutes":
      return `${v} min`;
    case "bps":
      return `${(v / 100).toFixed(1)}%`;
    case "tenths":
      return `${(v / 10).toFixed(1)} mo`;
    default:
      return String(v);
  }
}
const cmpText = { gte: "at least", lt: "under", lte: "at most" } as const;

function toField(unit: Unit, v: number): string {
  if (unit === "cents") return v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2);
  if (unit === "bps") return bpsToPercent(v);
  if (unit === "tenths") return String(v / 10);
  return String(v);
}
function fromField(unit: Unit, text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  if (unit === "cents") return parseDollarsToCents(t);
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  if (unit === "bps") return n <= 100 ? Math.round(n * 100) : null;
  if (unit === "tenths") return n <= 120 ? Math.round(n * 10) : null;
  return Number.isInteger(n) ? n : null;
}

/** The five go/no-go checkpoints, judged from real data, with editable thresholds. */
export function GatesPanel({ gates, canEdit }: { gates: GateResult[]; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(gates.flatMap((g) => g.criteria.map((c) => [`${g.checkpoint}/${c.metric}`, toField(gateMetricInfo[c.metric].unit, c.threshold)]))));
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => Object.fromEntries(gates.flatMap((g) => g.criteria.map((c) => [`${g.checkpoint}/${c.metric}`, c.enabled]))));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    const rows = gates.flatMap((g) =>
      g.criteria.map((c) => {
        const key = `${g.checkpoint}/${c.metric}`;
        const unit = gateMetricInfo[c.metric].unit;
        const v = unit === "tier" ? 0 : fromField(unit, values[key] ?? "");
        if (v === null) found[key] = "Enter a number";
        return { checkpoint: g.checkpoint, metric: c.metric, threshold: v ?? 0, enabled: enabled[key] ?? true };
      }),
    );
    if (Object.keys(found).length > 0) return setErrors(found);
    const parsed = gateCriteriaSchema.safeParse({ rows });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => saveGateCriteria({ rows }), "Gate criteria saved");
  }

  return (
    <div className="space-y-4" data-testid="gates-panel">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {gates.map((g) => (
          <GlassPanel key={g.checkpoint} as="section" aria-label={`${g.label} gate`} level="flat" className="kc-enter min-w-0 space-y-3 p-4" data-testid={`gate-${g.checkpoint}`} data-status={g.status}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-heading text-base font-medium text-ink">{g.label}</h3>
                <p className="text-[12px] text-ink-muted">Judged {formatCalendarDate(g.dueOn)}</p>
              </div>
              <StatusPill tone={gateTone[g.status]}>{gateText[g.status]}</StatusPill>
            </div>
            <ul className="space-y-2">
              {g.criteria.filter((c) => c.enabled).map((c) => {
                const info = gateMetricInfo[c.metric];
                return (
                  <li key={c.metric} className="text-[13px]" data-state={c.state}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-ink">{info.label}</span>
                      <StatusPill tone={critTone[c.state]}>{critText[c.state]}</StatusPill>
                    </div>
                    <p className="text-ink-muted tabular">
                      {c.hidden ? "Owner/admin only" : c.value === null ? "No data yet" : show(info.unit, c.value)} · needs {cmpText[info.compare]} {show(info.unit, c.threshold)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </GlassPanel>
        ))}
      </div>
      {canEdit && (
        <details className="rounded-md border border-hairline p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Edit the gates</summary>
          <form onSubmit={submit} className="mt-4 space-y-5" noValidate aria-label="Edit the go/no-go gates">
            {gates.map((g) => (
              <fieldset key={g.checkpoint} className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-ink">{g.label}</legend>
                {g.criteria.map((c) => {
                  const key = `${g.checkpoint}/${c.metric}`;
                  const info = gateMetricInfo[c.metric];
                  return (
                    <div key={key} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[1fr_9rem_6rem]">
                      <Label htmlFor={`gate-${key}`} className="font-normal">{info.label} <span className="text-ink-muted">({cmpText[info.compare]})</span></Label>
                      {info.unit === "tier" ? (
                        <span className="text-[13px] text-ink-muted">The base tier target</span>
                      ) : (
                        <Input id={`gate-${key}`} inputMode="decimal" value={values[key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} aria-invalid={Boolean(errors[key])} className="h-11 md:h-9" />
                      )}
                      <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                        <Checkbox checked={enabled[key] ?? true} onCheckedChange={(v) => setEnabled((x) => ({ ...x, [key]: v === true }))} aria-label={`${g.label}: use ${info.label}`} />
                        Use
                      </label>
                      {errors[key] && <p role="alert" className="text-[12px] text-danger sm:col-span-3">{errors[key]}</p>}
                    </div>
                  );
                })}
              </fieldset>
            ))}
            <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-gates">{pending ? "Saving…" : "Save gates"}</Button>
          </form>
        </details>
      )}
    </div>
  );
}

/** Triggers for hiring that light up when your numbers reach them. */
export function HireTriggersPanel({ triggers, canEdit }: { triggers: HireTrigger[]; canEdit: boolean }) {
  const { run, pending } = useFinanceAction();
  const [rows, setRows] = useState(() => triggers.map((t) => ({ key: t.key, label: t.label, threshold: String(t.threshold), enabled: t.enabled })));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const out = rows.map((r) => ({ key: r.key, label: r.label, threshold: Number(r.threshold), enabled: r.enabled }));
    const parsed = hireTriggersSchema.safeParse({ rows: out });
    if (!parsed.success) {
      const i = parsed.error.issues[0]?.path[1];
      return setErrors({ [String(i ?? "form")]: parsed.error.issues[0]?.message ?? "Check the form" });
    }
    setErrors({});
    run(() => saveHireTriggers({ rows: out }), "Hire triggers saved");
  }

  return (
    <div className="space-y-4" data-testid="hire-triggers">
      <div className="grid gap-3 md:grid-cols-3">
        {triggers.map((t) => (
          <GlassPanel key={t.key} as="div" level="flat" className="kc-enter min-w-0 space-y-1 p-4" data-testid={`hire-${t.key}`} data-lit={t.lit || undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{t.label}</span>
              <StatusPill tone={!t.enabled ? "neutral" : t.lit ? "warning" : "success"}>{!t.enabled ? "Off" : t.lit ? "Time to act" : "Not yet"}</StatusPill>
            </div>
            <p className="text-[13px] text-ink-muted tabular">{t.value} {t.unit} · triggers at {t.threshold}</p>
          </GlassPanel>
        ))}
      </div>
      {canEdit && (
        <details className="rounded-md border border-hairline p-4">
          <summary className="cursor-pointer text-sm font-medium text-ink">Edit the hire triggers</summary>
          <form onSubmit={submit} className="mt-4 space-y-4" noValidate aria-label="Edit the hire triggers">
            {rows.map((r, i) => (
              <div key={r.key} className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_5rem]">
                <div className="space-y-1.5">
                  <Label htmlFor={`hire-label-${r.key}`}>What to do ({{ clients: "when clients reach", leads_per_week: "when leads a week reach", crews_short: "when crews short reach" }[r.key]})</Label>
                  <Input id={`hire-label-${r.key}`} value={r.label} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} className="h-11 md:h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`hire-th-${r.key}`}>At</Label>
                  <Input id={`hire-th-${r.key}`} inputMode="numeric" value={r.threshold} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, threshold: e.target.value } : y)))} aria-invalid={Boolean(errors[String(i)])} className="h-11 md:h-9" />
                </div>
                <label className="flex items-center gap-2 pb-2 text-[13px] text-ink-muted">
                  <Checkbox checked={r.enabled} onCheckedChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, enabled: v === true } : y)))} aria-label={`Use the ${r.key} trigger`} />
                  Use
                </label>
                {errors[String(i)] && <p role="alert" className="text-[12px] text-danger sm:col-span-3">{errors[String(i)]}</p>}
              </div>
            ))}
            <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="save-hire-triggers">{pending ? "Saving…" : "Save triggers"}</Button>
          </form>
        </details>
      )}
    </div>
  );
}

const kindItems = DECISION_KINDS.map((k) => ({ value: k, label: { general: "General", gate: "Gate", channel: "Channel", hire: "Hire" }[k] }));

/** Dated notes on what you decided and why. Anyone on the team can read them; owner/admin write. */
export function DecisionLog({ decisions, canEdit, today, prefill }: { decisions: GrowthSnapshot["decisions"]; canEdit: boolean; today: string; prefill?: { kind: string; decision: string } }) {
  const { run, pending } = useFinanceAction();
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<string>(prefill?.kind ?? "general");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState(prefill?.decision ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { date, kind, note, decision };
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(() => addDecision(input), "Decision logged", () => {
      setNote("");
      setDecision("");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="decision-log">
      <GlassPanel as="div" className="min-w-0 p-5">
        <h3 className="font-heading text-base font-medium text-ink">Log a decision</h3>
        <p className="mb-4 text-[13px] text-ink-muted">The date, what you saw, and what you decided. The app only recommends; this is where you decide.</p>
        {canEdit ? (
          <form onSubmit={submit} className="space-y-4" noValidate aria-label="Log a decision">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dec-date">Date</Label>
                <Input id="dec-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 md:h-9" />
                {errors.date && <p role="alert" className="text-[12px] text-danger">{errors.date}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>About</Label>
                <Select items={kindItems} value={kind} onValueChange={(v) => v && setKind(v)}>
                  <SelectTrigger className="h-11 w-full min-w-0 md:h-9" aria-label="About"><SelectValue /></SelectTrigger>
                  <SelectContent>{kindItems.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dec-decision">Decision</Label>
              <Input id="dec-decision" value={decision} onChange={(e) => setDecision(e.target.value)} aria-invalid={Boolean(errors.decision)} className="h-11 md:h-9" />
              {errors.decision && <p role="alert" className="text-[12px] text-danger">{errors.decision}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dec-note">Note</Label>
              <Textarea id="dec-note" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(errors.note)} />
              {errors.note && <p role="alert" className="text-[12px] text-danger">{errors.note}</p>}
            </div>
            <Button type="submit" disabled={pending} className="h-11 sm:h-9" data-testid="add-decision">{pending ? "Saving…" : "Log decision"}</Button>
          </form>
        ) : (
          <p className="text-[13px] text-ink-muted">Only the owner or an admin can log decisions.</p>
        )}
      </GlassPanel>
      <GlassPanel as="div" className="min-w-0 overflow-hidden">
        <div className="border-b border-hairline px-5 py-4"><h3 className="font-heading text-base font-medium text-ink">Decision log</h3></div>
        {decisions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-hairline" data-testid="decision-list">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink"><span className="font-medium">{formatCalendarDate(d.date)}</span> · {d.decision} <span className="text-ink-muted">({d.kind})</span></p>
                  <p className="whitespace-pre-wrap text-ink-muted">{d.note}</p>
                </div>
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 md:size-8" aria-label={`Delete the decision from ${formatCalendarDate(d.date)}`} disabled={pending} onClick={() => run(() => deleteDecision({ id: d.id }), "Decision deleted")}>
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}
