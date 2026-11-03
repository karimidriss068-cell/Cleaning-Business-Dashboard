"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, MessagesSquare, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/system/sparkline";
import { AGENTS, APPROVALS, FEED, GUARDRAILS, HANDOFFS, type Agent, type AgentStatus } from "./agent-data";

const statusDot: Record<AgentStatus, string> = { working: "bg-success", waiting: "bg-warning", idle: "bg-ink-muted", paused: "bg-danger" };
const statusText: Record<AgentStatus, string> = { working: "Working", waiting: "Needs you", idle: "Idle", paused: "Paused" };
const toneText = { success: "text-success", warning: "text-warning", danger: "text-danger", info: "text-brand-text", neutral: "text-ink-muted" } as const;
const stateTone = { ok: "text-success ring-success/40", warn: "text-warning ring-warning/40", tripped: "text-danger ring-danger/40" } as const;
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const glass = "glass-card relative overflow-hidden rounded-md border";

function Kpis() {
  const live = AGENTS.filter((a) => a.status !== "paused").length;
  const items = [
    ["Agents live", `${live} / ${AGENTS.length}`, `${AGENTS.filter((a) => a.status === "working").length} working now`],
    ["Tasks today", AGENTS.reduce((s, a) => s + a.tasksToday, 0).toString(), "+14% vs last Tue"],
    ["Hours saved", `${AGENTS.reduce((s, a) => s + a.hoursSaved, 0).toFixed(1)}h`, "this week"],
    ["$ influenced", money(AGENTS.reduce((s, a) => s + a.influencedCents, 0)), "booked + collected"],
    ["Escalations", AGENTS.reduce((s, a) => s + a.escalations, 0).toString(), `${AGENTS.reduce((s, a) => s + a.errors, 0)} errors`],
    ["Approval backlog", APPROVALS.length.toString(), `${APPROVALS.reduce((s, a) => s + a.minutes, 0)} min of your time`],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="agent-kpis">
      {items.map(([l, v, sub]) => (
        <div key={l} className={cn(glass, "p-4")}>
          <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-brand/60 to-transparent" />
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{l}</p>
          <p className="mt-1 font-heading text-[28px] leading-8 font-medium tracking-[-0.02em] text-ink tabular text-glow">{v}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">{sub}</p>
        </div>
      ))}
    </div>
  );
}

function AgentCard({ a, onOpen }: { a: Agent; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} data-testid={`agent-${a.id}`}
      className={cn(glass, "group flex min-h-[260px] flex-col gap-3 p-5 text-left transition-all hover:-translate-y-0.5 hover:ring-1 hover:ring-brand/50 focus-visible:ring-2 focus-visible:ring-brand")}>
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-brand/70 to-transparent" />
      <div className="flex items-start gap-3">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand/35 to-brand/5 font-heading text-xl font-semibold text-ink ring-1 ring-brand/30">
          {a.name[0]}
          <span className={cn("absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-canvas", statusDot[a.status], a.status === "working" && "motion-safe:animate-pulse")} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-lg font-medium text-ink">{a.name}</h3>
            <span className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">{a.desk}</span>
          </div>
          <p className="truncate text-[13px] text-ink-muted">{a.role}</p>
        </div>
      </div>
      <div className="rounded-md bg-surface/60 px-3 py-2 ring-1 ring-hairline">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
          <span className={cn("size-1.5 rounded-full", statusDot[a.status])} />
          <span className={a.status === "paused" ? "text-danger" : a.status === "waiting" ? "text-warning" : "text-ink-muted"}>{statusText[a.status]}</span>
          <span className="ml-auto flex items-center gap-1 font-normal tracking-normal text-ink-muted normal-case"><Clock className="size-3" aria-hidden />{a.lastAction}</span>
        </p>
        <p className="mt-1 line-clamp-2 text-[13px] text-ink">{a.task}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {a.tools.map((t) => <span key={t} className="rounded-full px-2 py-0.5 text-[11px] text-ink-muted ring-1 ring-hairline ring-inset">{t}</span>)}
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 border-t border-hairline pt-3">
        <div className="grid grid-cols-3 gap-4 text-[11px] text-ink-muted">
          <div><p className="font-heading text-base text-ink tabular">{a.success}%</p>success</div>
          <div><p className="font-heading text-base text-ink tabular">{a.tasksToday}</p>tasks</div>
          <div><p className="font-heading text-base text-ink tabular">{a.hoursSaved}h</p>saved</div>
        </div>
        <Sparkline values={a.spark} width={84} height={32} />
      </div>
    </button>
  );
}

function Rail() {
  return (
    <div className="space-y-4">
      <div className={cn(glass, "p-4")}>
        <h3 className="mb-3 flex items-center justify-between text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Approvals queue <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning normal-case">{APPROVALS.length} waiting</span></h3>
        <ul className="space-y-2">
          {APPROVALS.map((p) => (
            <li key={p.what} className="rounded-md bg-surface/60 p-3 ring-1 ring-hairline">
              <p className="text-[11px] text-brand-text">{p.who} · {p.risk}</p>
              <p className="mt-0.5 text-[13px] text-ink">{p.what}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px]">
                <span className="rounded-md bg-brand/20 px-2 py-1 text-ink ring-1 ring-brand/40">Approve</span>
                <span className="rounded-md px-2 py-1 text-ink-muted ring-1 ring-hairline">Review</span>
                <span className="ml-auto text-ink-muted">{p.minutes}m</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn(glass, "p-4")}>
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase"><span className="relative flex size-2"><span className="absolute inset-0 rounded-full bg-success opacity-60 motion-safe:animate-ping" /><span className="relative size-2 rounded-full bg-success" /></span>Live activity</h3>
        <ol className="space-y-2.5">
          {FEED.map((f) => (
            <li key={f.at + f.who} className="grid grid-cols-[2.75rem_1fr] gap-2 text-[13px]">
              <span className="text-ink-muted tabular">{f.at}</span>
              <span><b className={cn("font-semibold", toneText[f.tone])}>{f.who}</b> <span className="text-ink">{f.text}</span></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Below() {
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <div className={cn(glass, "p-4 xl:col-span-6")}>
        <h3 className="mb-3 text-[13px] font-semibold text-ink">Agent performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular">
            <thead><tr className="text-left text-[11px] tracking-[0.08em] text-ink-muted uppercase">
              {["Agent", "Tasks", "Success", "Hours saved", "$ influenced", "Errors", "Escal."].map((h, i) => <th key={h} className={cn("py-1.5 font-semibold", i ? "pl-3 text-right" : "pr-3")}>{h}</th>)}
            </tr></thead>
            <tbody>{[...AGENTS].sort((x, y) => y.influencedCents - x.influencedCents).map((a) => (
              <tr key={a.id} className="border-t border-border/60">
                <td className="py-1.5 pr-3 text-ink"><span className={cn("mr-2 inline-block size-1.5 rounded-full", statusDot[a.status])} />{a.name}</td>
                <td className="pl-3 text-right">{a.tasksToday}</td>
                <td className="pl-3 text-right">{a.success}%</td>
                <td className="pl-3 text-right">{a.hoursSaved}h</td>
                <td className="pl-3 text-right">{money(a.influencedCents)}</td>
                <td className={cn("pl-3 text-right", a.errors > 1 && "text-danger")}>{a.errors}</td>
                <td className="pl-3 text-right">{a.escalations}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className={cn(glass, "p-4 xl:col-span-3")}>
        <h3 className="mb-3 text-[13px] font-semibold text-ink">Lead → payout handoffs</h3>
        <ol className="relative space-y-3 border-l border-hairline pl-4">
          {HANDOFFS.map((h) => (
            <li key={h.stage} className="relative">
              <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-2 ring-canvas", h.state === "ok" ? "bg-success" : "bg-warning")} />
              <p className="text-[13px] text-ink">{h.stage} <span className="text-ink-muted">· {h.owner}</span></p>
              <p className={cn("text-[12px]", h.state === "ok" ? "text-ink-muted" : "text-warning")}>{h.note}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className={cn(glass, "p-4 xl:col-span-3")}>
        <h3 className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><ShieldAlert className="size-4 text-warning" aria-hidden />Guardrails</h3>
        <ul className="space-y-2">
          {GUARDRAILS.map((g) => (
            <li key={g.label} className="flex items-start justify-between gap-2 text-[13px]">
              <span><span className="text-ink">{g.label}</span> <span className="text-ink-muted">· {g.owner}</span><br /><span className="text-[12px] text-ink-muted">{g.note}</span></span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset", stateTone[g.state])}>{g.state}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Sheet({ a, onClose }: { a: Agent; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`${a.name} details`} onClick={(e) => e.stopPropagation()}
        className="glass-card h-full w-full max-w-md space-y-5 overflow-y-auto border-l p-6 shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{a.desk} desk</p>
            <h2 className="font-heading text-2xl font-medium text-ink">{a.name}</h2>
            <p className="text-[13px] text-ink-muted">{a.role}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-ink-muted hover:text-ink"><X className="size-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Success", `${a.success}%`], ["Hours saved", `${a.hoursSaved}h`], ["Owner time", `${a.ownerMinutes}m`]].map(([l, v]) => (
            <div key={l} className="rounded-md bg-surface/60 p-2 ring-1 ring-hairline"><p className="font-heading text-lg text-ink tabular">{v}</p><p className="text-[11px] text-ink-muted">{l}</p></div>
          ))}
        </div>
        <section><h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Now</h3><p className="text-[14px] text-ink">{a.task}</p></section>
        <section><h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Log</h3>
          <ol className="space-y-2">{a.log.map((l) => <li key={l.at + l.text} className="grid grid-cols-[4.5rem_1fr] text-[13px]"><span className="text-ink-muted tabular">{l.at}</span><span className="text-ink">{l.text}</span></li>)}</ol>
        </section>
        <section><h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">SOPs</h3>
          <ul className="space-y-2">{a.sops.map((s) => <li key={s.name} className="flex items-start gap-2 text-[13px]"><CheckCircle2 className="mt-0.5 size-4 text-success" aria-hidden /><span><span className="text-ink">{s.name}</span><br /><span className="text-ink-muted">{s.note}</span></span></li>)}</ul>
        </section>
        <section><h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Tools</h3>
          <div className="flex flex-wrap gap-1.5">{a.tools.map((t) => <span key={t} className="rounded-full px-2 py-0.5 text-[12px] text-ink-muted ring-1 ring-hairline ring-inset">{t}</span>)}</div>
        </section>
        <Link href="/board" className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
          <MessagesSquare className="size-4" aria-hidden /> Convene in Roast Room
        </Link>
      </aside>
    </div>
  );
}

const DESKS = ["All", "Command", "Marketing", "Sales", "CRM"] as const;

export function AgentFloor({ dataRoom }: { dataRoom?: React.ReactNode }) {
  const [view, setView] = useState<"floor" | "data">("floor");
  const [desk, setDesk] = useState<(typeof DESKS)[number]>("All");
  const [open, setOpen] = useState<Agent | null>(null);
  const shown = desk === "All" ? AGENTS : AGENTS.filter((a) => a.desk === desk);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Agent room views" className="flex gap-1 border-b border-border/60">
          {([["floor", "Live floor"], ["data", "Data room"]] as const).map(([k, l]) => (
            <button key={k} role="tab" type="button" aria-selected={view === k} onClick={() => setView(k)}
              className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] font-medium", view === k ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{l}</button>
          ))}
        </div>
        {view === "floor" && (
          <div role="group" aria-label="Desk" className="inline-flex rounded-full p-0.5 ring-1 ring-hairline ring-inset">
            {DESKS.map((d) => (
              <button key={d} type="button" aria-pressed={desk === d} onClick={() => setDesk(d)}
                className={cn("rounded-full px-3 py-1 text-[12px] font-medium", desk === d ? "bg-brand/20 text-ink ring-1 ring-brand/50" : "text-ink-muted hover:text-ink")}>{d}</button>
            ))}
          </div>
        )}
      </div>
      {view === "data" ? (dataRoom ?? <p className="text-sm text-ink-muted">The data room needs demo mode on.</p>) : (
        <>
          <Kpis />
          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <div className="grid content-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {shown.map((a) => <AgentCard key={a.id} a={a} onOpen={() => setOpen(a)} />)}
            </div>
            <Rail />
          </div>
          <Below />
        </>
      )}
      {open && <Sheet a={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
