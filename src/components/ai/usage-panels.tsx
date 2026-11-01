"use client";

import { useState } from "react";
import { OctagonX, Play, Trash2 } from "lucide-react";
import { deleteAiBudget, saveAiBudget, setAiKillSwitch } from "@/app/actions/ai";
import { budgetAlerts, scopeLabel, type AiSummary } from "@/lib/ai/budget";
import { microsToCents } from "@/lib/ai/pricing";
import { budgetSchema, capFromInput } from "@/lib/schemas/ai";
import { formatCents, formatNyDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { Meter } from "@/components/system/meter";
import { StatTile } from "@/components/system/stat-tile";
import { StatusPill } from "@/components/system/status-pill";
import { useFinanceAction } from "@/components/invoices/use-finance-action";
import type { Tone } from "@/lib/status";

const cents = (micros: number) => microsToCents(micros);
const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));
const capText = (c: number | null) => (c === null ? "No cap" : formatCents(c, { hideZeroCents: true }));
const ratio = (micros: number, capCents: number | null) => (capCents === null ? 0 : capCents === 0 ? 1 : micros / (capCents * 10_000));
const toneFor = (r: number): Tone => (r >= 1 ? "danger" : r >= 0.8 ? "warning" : "info");

/** Alert at 80% of any cap, and the kill switch state. */
export function AlertsPanel({ summary }: { summary: AiSummary }) {
  const alerts = budgetAlerts(summary);
  if (alerts.length === 0 && !summary.kill_switch) return null;
  return (
    <GlassPanel as="section" aria-label="AI budget alerts" level="popover" role="alert" className="kc-enter space-y-2 p-4" data-testid="ai-alerts">
      {summary.kill_switch && <p className="flex items-center gap-2 text-sm font-medium text-danger"><OctagonX className="size-4" aria-hidden /> AI is switched off. Every AI call is being refused.</p>}
      {alerts.map((a) => (
        <p key={`${a.scope}-${a.key}-${a.window}`} className="text-sm text-ink" data-testid="ai-alert">
          <StatusPill tone={a.over ? "danger" : "warning"}>{a.over ? (a.hardStop ? "Stopped" : "Over") : `${Math.floor(a.percent)}% used`}</StatusPill>{" "}
          <span className="font-medium">{scopeLabel[a.scope]} {a.key === "*" ? "(each)" : a.key}</span>: {formatCents(a.spentCents)} of {formatCents(a.capCents)} {a.window === "daily" ? "today" : "this month"}
          {a.over && a.hardStop ? ". New calls are refused until the cap resets or you raise it." : ""}
        </p>
      ))}
    </GlassPanel>
  );
}

export function Overview({ summary, keys }: { summary: AiSummary; keys: { anthropic: boolean; xai: boolean } }) {
  const global = summary.budgets.find((b) => b.scope === "global");
  const month = global?.month_micros ?? 0;
  const day = global?.day_micros ?? 0;
  const mr = ratio(month, global?.monthly_cap_cents ?? null);
  return (
    <section aria-label="Spend" className="space-y-4" data-testid="ai-overview">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile index={1} label="Spent this month" figure={{ value: cents(month), kind: "cents" }} hint={`of ${capText(global?.monthly_cap_cents ?? null)}`} />
        <StatTile index={2} label="Spent today" figure={{ value: cents(day), kind: "cents" }} hint={`of ${capText(global?.daily_cap_cents ?? null)} (New York day)`} />
        <StatTile index={3} label="Refused, last 24 hours" figure={{ value: summary.refused_24h, kind: "count" }} hint="Calls stopped by a cap or the kill switch" />
      </div>
      {global?.monthly_cap_cents != null && <Meter value={mr} tone={toneFor(mr)} label={`${Math.round(mr * 100)}% of the monthly AI cap used`} />}
      <ul className="flex flex-wrap gap-2 text-[13px]" aria-label="Provider keys">
        <li><StatusPill tone={keys.anthropic ? "success" : "warning"}>Anthropic key {keys.anthropic ? "set" : "missing"}</StatusPill></li>
        <li><StatusPill tone={keys.xai ? "success" : "warning"}>xAI key {keys.xai ? "set" : "missing"}</StatusPill></li>
      </ul>
    </section>
  );
}

type Line = { id: string; name: string; sub: string; day: number; month: number; daily: number | null; monthly: number | null; calls: number };

function SpendList({ title, id, lines, empty }: { title: string; id: string; lines: Line[]; empty: string }) {
  return (
    <GlassPanel as="section" aria-labelledby={id} className="kc-enter p-5" data-testid={id}>
      <h2 id={id} className="font-heading text-lg font-medium text-ink">{title}</h2>
      {lines.length === 0 ? <p className="mt-2 text-sm text-ink-muted">{empty}</p> : (
        <ul className="mt-3 space-y-4">
          {lines.map((l) => {
            const r = Math.max(ratio(l.month, l.monthly), ratio(l.day, l.daily));
            return (
              <li key={l.id} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-sm font-medium text-ink">{l.name} <span className="text-[12px] font-normal text-ink-muted">{l.sub}</span></span>
                  <span className="tabular text-sm text-ink"><AnimatedNumber value={cents(l.month)} kind="cents" /> <span className="text-ink-muted">this month · </span><AnimatedNumber value={cents(l.day)} kind="cents" /> <span className="text-ink-muted">today</span></span>
                </div>
                {(l.monthly !== null || l.daily !== null) && <Meter value={r} tone={toneFor(r)} label={`${l.name}: ${Math.round(r * 100)}% of its tightest cap`} />}
                <p className="text-[12px] text-ink-muted">{l.calls} {l.calls === 1 ? "call" : "calls"} · {l.daily === null ? "no daily cap" : `${capText(l.daily)} a day`}, {l.monthly === null ? "no monthly cap" : `${capText(l.monthly)} a month`}</p>
              </li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}

export function SpendByFeature({ summary }: { summary: AiSummary }) {
  return <SpendList title="Spend by feature" id="ai-by-feature" empty="No AI calls yet this month." lines={summary.by_feature.map((f) => ({ id: f.feature, name: f.feature, sub: "", day: f.day_micros, month: f.month_micros, daily: f.daily_cap_cents, monthly: f.monthly_cap_cents, calls: f.calls }))} />;
}
export function SpendByActor({ summary }: { summary: AiSummary }) {
  return <SpendList title="Spend by bot and person" id="ai-by-actor" empty="No bot or person has made an AI call yet this month." lines={summary.by_actor.map((a) => ({ id: `${a.actor_type}-${a.actor_id}`, name: a.actor_id, sub: a.actor_type === "bot" ? "bot" : "person", day: a.day_micros, month: a.month_micros, daily: a.daily_cap_cents, monthly: a.monthly_cap_cents, calls: a.calls }))} />;
}

export function KillSwitch({ on }: { on: boolean }) {
  const { run, pending } = useFinanceAction();
  return (
    <GlassPanel as="section" aria-labelledby="ai-kill" className="kc-enter flex flex-wrap items-center justify-between gap-3 p-5" data-testid="ai-kill-switch">
      <div>
        <h2 id="ai-kill" className="flex items-center gap-2 font-heading text-lg font-medium text-ink">
          Kill switch <StatusPill tone={on ? "danger" : "success"}>{on ? "AI is off" : "AI is on"}</StatusPill>
        </h2>
        <p className="text-[13px] text-ink-muted">Switch off to refuse every AI call from every feature and bot, right away. Calls already running finish and are counted.</p>
      </div>
      <Button type="button" variant={on ? "default" : "secondary"} disabled={pending} className="h-11 md:h-9" data-testid="ai-kill-toggle"
        onClick={() => run(() => setAiKillSwitch({ on: !on }), on ? "AI is back on" : "AI is switched off")}>
        {on ? <><Play aria-hidden /> Turn AI back on</> : <><OctagonX aria-hidden /> Switch all AI off</>}
      </Button>
    </GlassPanel>
  );
}

const SCOPES = [{ value: "feature", label: "Feature" }, { value: "bot", label: "Bot" }, { value: "user", label: "Person" }];

function CapRow({ b }: { b: AiSummary["budgets"][number] }) {
  const { run, pending } = useFinanceAction();
  const [daily, setDaily] = useState(dollars(b.daily_cap_cents));
  const [monthly, setMonthly] = useState(dollars(b.monthly_cap_cents));
  const [hard, setHard] = useState(b.hard_stop);
  const [error, setError] = useState<string | null>(null);
  const id = `cap-${b.scope}-${b.key}`;

  function save() {
    const d = capFromInput(daily);
    const m = capFromInput(monthly);
    if ("error" in d) return setError(d.error);
    if ("error" in m) return setError(m.error);
    const input = { scope: b.scope, key: b.key, dailyCents: d.cents, monthlyCents: m.cents, hardStop: hard };
    const parsed = budgetSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the caps");
    setError(null);
    run(() => saveAiBudget(input), "Cap saved");
  }
  const name = b.scope === "global" ? "All AI together" : `${scopeLabel[b.scope]}: ${b.key === "*" ? "each one (default)" : b.key}`;
  return (
    <li className="space-y-2 rounded-sm border border-hairline p-3" data-testid={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{name}</span>
        {b.scope !== "global" && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} className="h-9 text-danger" aria-label={`Remove the cap for ${name}`}
            onClick={() => run(() => deleteAiBudget({ scope: b.scope, key: b.key }), "Cap removed")}><Trash2 aria-hidden /> Remove</Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-d`}>Daily cap ($)</Label>
          <Input id={`${id}-d`} inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="No cap" className="h-11 md:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-m`}>Monthly cap ($)</Label>
          <Input id={`${id}-m`} inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="No cap" className="h-11 md:h-9" />
        </div>
        <label className="flex h-11 items-center gap-2 text-sm text-ink md:h-9">
          <Checkbox checked={hard} onCheckedChange={(c) => setHard(c === true)} aria-label={`Hard stop for ${name}`} /> Hard stop
        </label>
        <Button type="button" disabled={pending} onClick={save} className="h-11 md:h-9" data-testid={`${id}-save`}>Save</Button>
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </li>
  );
}

function AddCap() {
  const { run, pending } = useFinanceAction();
  const [scope, setScope] = useState("bot");
  const [key, setKey] = useState("");
  const [daily, setDaily] = useState("");
  const [monthly, setMonthly] = useState("");
  const [error, setError] = useState<string | null>(null);
  function add(e: React.FormEvent) {
    e.preventDefault();
    const d = capFromInput(daily);
    const m = capFromInput(monthly);
    if ("error" in d) return setError(d.error);
    if ("error" in m) return setError(m.error);
    const input = { scope, key, dailyCents: d.cents, monthlyCents: m.cents, hardStop: true };
    const parsed = budgetSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the caps");
    setError(null);
    run(() => saveAiBudget(input), "Cap added", () => { setKey(""); setDaily(""); setMonthly(""); });
  }
  return (
    <form onSubmit={add} noValidate className="space-y-2 rounded-sm border border-dashed border-hairline p-3" aria-label="Add a cap" data-testid="ai-add-cap">
      <p className="text-sm font-medium text-ink">Add a cap for one feature, bot or person</p>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label>Applies to</Label>
          <Select items={SCOPES} value={scope} onValueChange={(v) => v && setScope(v)}>
            <SelectTrigger className="h-11 w-full md:h-9" aria-label="Applies to"><SelectValue /></SelectTrigger>
            <SelectContent>{SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-add-key">Name</Label>
          <Input id="ai-add-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder={scope === "user" ? "person's user id" : scope === "bot" ? "e.g. roast-room" : "e.g. board"} className="h-11 md:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-add-d">Daily ($)</Label>
          <Input id="ai-add-d" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} className="h-11 md:h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-add-m">Monthly ($)</Label>
          <Input id="ai-add-m" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="h-11 md:h-9" />
        </div>
        <Button type="submit" disabled={pending} className="h-11 md:h-9">Add</Button>
      </div>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </form>
  );
}

export function CapsEditor({ summary }: { summary: AiSummary }) {
  return (
    <GlassPanel as="section" aria-labelledby="ai-caps" className="kc-enter space-y-4 p-5" data-testid="ai-caps">
      <div>
        <h2 id="ai-caps" className="font-heading text-lg font-medium text-ink">Caps</h2>
        <p className="text-[13px] text-ink-muted">Days and months are New York time. A call is held against every cap that applies to it before it is sent, so a cap is never passed. With hard stop off, a cap only raises an alert. The default for &quot;each&quot; applies to every bot or person separately.</p>
      </div>
      <ul className="space-y-3">{summary.budgets.map((b) => <CapRow key={`${b.scope}-${b.key}-${b.daily_cap_cents}-${b.monthly_cap_cents}-${b.hard_stop}`} b={b} />)}</ul>
      <AddCap />
    </GlassPanel>
  );
}

const statusTone: Record<AiSummary["recent"][number]["status"], Tone> = { settled: "success", reserved: "info", failed: "warning", refused: "danger" };
const statusText: Record<AiSummary["recent"][number]["status"], string> = { settled: "Done", reserved: "Running", failed: "Failed", refused: "Refused" };

export function RecentCalls({ summary }: { summary: AiSummary }) {
  return (
    <GlassPanel as="section" aria-labelledby="ai-recent" className="kc-enter p-5" data-testid="ai-recent">
      <h2 id="ai-recent" className="font-heading text-lg font-medium text-ink">Latest calls</h2>
      <p className="text-[13px] text-ink-muted">Counts and cost only. What was asked and answered is never stored.</p>
      {summary.recent.length === 0 ? <p className="mt-3 text-sm text-ink-muted">Nothing yet.</p> : (
        <ul className="mt-3 divide-y divide-hairline">
          {summary.recent.map((r, i) => (
            <li key={`${r.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <span className="min-w-0 text-ink"><span className="font-medium">{r.feature}</span> <span className="text-ink-muted">· {r.actor_id} · {r.model} · {formatNyDateTime(r.at)}</span></span>
              <span className="flex items-center gap-2"><span className="tabular text-ink">{formatCents(cents(r.cost_micros))}</span><StatusPill tone={statusTone[r.status]}>{statusText[r.status]}</StatusPill></span>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}
