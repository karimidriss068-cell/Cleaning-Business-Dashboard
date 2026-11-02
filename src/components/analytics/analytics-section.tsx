"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PACKS, type Kind, type Panel, type Row } from "./packs";

type Range = "7d" | "30d" | "90d";
const FACTOR: Record<Range, number> = { "7d": 7 / 30, "30d": 1, "90d": 3 };
const SCALES: Kind[] = ["money", "count", "hours"];
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const MONEY_KEY = /revenue|value|spend|cpl|ltv|eph|discounted|ticket|invoiced|collected|deposits|burn|payouts|committed|best_case|target|actual|plan|residential|commercial/;
const RAW_KEY = /lag|rows|readers|leads|travel|stuck|jobs|reach|freq|errors|escalations|won|lost|booked$|roas/;

function fmt(v: number, kind: Kind): string {
  switch (kind) {
    case "money": return `$${Math.round(v / 100).toLocaleString("en-US")}`;
    case "pct": return `${v.toFixed(v % 1 ? 1 : 0)}%`;
    case "days": return `${v.toFixed(1)}d`;
    case "hours": return `${Math.round(v).toLocaleString("en-US")}h`;
    case "min": return `${v.toFixed(1)}m`;
    case "ratio": return v.toFixed(v >= 10 ? 0 : 2).replace(/\.?0+$/, "") || "0";
    default: return Math.round(v).toLocaleString("en-US");
  }
}
const colKind = (key: string, kind: Kind): Kind =>
  MONEY_KEY.test(key) && kind !== "pct" ? "money" : key === "ticket" ? "money" : RAW_KEY.test(key) ? (key === "roas" ? "ratio" : "count") : kind;
const label = (k: string) => k.replace(/_x10$/, " ×10").replace(/_/g, " ");

function scaleRows(data: Row[], kind: Kind, f: number): Row[] {
  if (!SCALES.includes(kind) || f === 1) return data;
  return data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" && colKind(k, kind) !== "pct" ? v * f : v])));
}

const axis = { stroke: "currentColor", tick: { fontSize: 11, fill: "currentColor" }, tickLine: false, axisLine: false } as const;
const tip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" },
  cursor: { fill: "var(--accent)", opacity: 0.25 },
};

function PanelChart({ p, f }: { p: Panel; f: number }) {
  const data = useMemo(() => scaleRows(p.data, p.kind, f), [p, f]);
  const tf = (v: unknown) => fmt(Number(v), p.kind);
  if (p.type === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular">
          <thead><tr className="text-left text-[11px] tracking-[0.08em] text-ink-muted uppercase">
            <th className="py-1.5 pr-3 font-semibold">Item</th>
            {p.keys.map((k) => <th key={k} className="py-1.5 pl-3 text-right font-semibold">{label(k)}</th>)}
          </tr></thead>
          <tbody>{data.map((r) => (
            <tr key={String(r.x)} className="border-t border-border/60">
              <td className="py-1.5 pr-3 text-ink">{r.x}</td>
              {p.keys.map((k) => <td key={k} className="py-1.5 pl-3 text-right">{fmt(Number(r[k]), colKind(k, p.kind))}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }
  if (p.type === "funnel") {
    const max = Math.max(...data.map((r) => Number(r[p.keys[0]])));
    return (
      <div className="space-y-2">{data.map((r, i) => {
        const v = Number(r[p.keys[0]]);
        const prev = i ? Number(data[i - 1][p.keys[0]]) : 0;
        return (
          <div key={String(r.x)} className="flex items-center gap-3 text-[13px]">
            <span className="w-32 shrink-0 text-ink-muted">{r.x}</span>
            <div className="h-6 flex-1 rounded bg-muted/40">
              <div className="h-6 rounded" style={{ width: `${(v / max) * 100}%`, background: COLORS[i % 2], opacity: 0.85 }} />
            </div>
            <span className="w-24 text-right tabular text-ink">{fmt(v, "count")}{i ? <span className="ml-1 text-ink-muted">{Math.round((v / prev) * 100)}%</span> : null}</span>
          </div>
        );
      })}</div>
    );
  }
  if (p.type === "donut") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey={p.keys[0]} nameKey="x" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip {...tip} formatter={tf} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (p.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" {...axis} />
          <YAxis {...axis} width={64} tickFormatter={tf} />
          <Tooltip {...tip} formatter={tf} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => label(String(v))} />
          {p.keys.map((k, i) => (
            <Line key={k} dataKey={k} type="monotone" dot={false} strokeWidth={2} stroke={COLORS[i % COLORS.length]}
              strokeDasharray={/target|plan|capacity/.test(k) ? "5 4" : undefined} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  const horizontal = p.type === "hbar";
  return (
    <ResponsiveContainer width="100%" height={horizontal ? Math.max(160, data.length * 38) : 240}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (<>
          <XAxis type="number" {...axis} tickFormatter={tf} />
          <YAxis type="category" dataKey="x" {...axis} width={120} />
        </>) : (<>
          <XAxis dataKey="x" {...axis} />
          <YAxis {...axis} width={64} tickFormatter={tf} />
        </>)}
        <Tooltip {...tip} formatter={tf} />
        {p.keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => label(String(v))} />}
        {p.keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId={p.stacked ? "s" : undefined} fill={COLORS[i % COLORS.length]} radius={p.stacked ? 0 : 4} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Analytics layer from design/keystone-dashboard (Growth OS v3): live dot,
 * 7d/30d/90d range that scales counts and money, KPI filter tiles and
 * tabbed panels. Demo data only.
 */
export function AnalyticsSection({ pack, className }: { pack: keyof typeof PACKS; className?: string }) {
  const def = PACKS[pack];
  const [range, setRange] = useState<Range>("30d");
  const [tab, setTab] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const f = FACTOR[range];
  const current = def.tabs[tab] ?? def.tabs[0];

  return (
    <section aria-label={def.title} className={cn("kc-enter space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="relative flex size-2.5"><span className="absolute inset-0 rounded-full bg-success opacity-60 motion-safe:animate-ping [animation-iteration-count:3]" /><span className="relative size-2.5 rounded-full bg-success" /></span>
          <h2 className="font-heading text-xl font-medium text-ink">{def.title}</h2>
          <span className="rounded-full px-2 py-0.5 text-[11px] text-ink-muted ring-1 ring-hairline ring-inset">Demo data</span>
        </div>
        <div role="group" aria-label="Range" className="inline-flex rounded-full p-0.5 ring-1 ring-hairline ring-inset">
          {(Object.keys(FACTOR) as Range[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
              className={cn("rounded-full px-3 py-1 text-[12px] font-medium transition-colors", range === r ? "bg-brand/20 text-ink ring-1 ring-brand/50" : "text-ink-muted hover:text-ink")}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {def.kpis.map((k) => {
          const on = filter === k.label;
          const v = SCALES.includes(k.kind) ? k.value * f : k.value;
          return (
            <button key={k.label} type="button" aria-pressed={on} onClick={() => setFilter(on ? null : k.label)}
              className={cn("glass-card relative overflow-hidden rounded-md border p-4 text-left transition-shadow", on && "ring-2 ring-brand/60")}>
              <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-brand/60 to-transparent" />
              <span className="text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{k.label}</span>
              <div className="mt-1 font-heading text-[28px] leading-8 font-medium tracking-[-0.02em] text-ink tabular text-glow">{fmt(v, k.kind)}</div>
              <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[12px] font-medium tabular ring-1 ring-inset", k.good ? "text-success-label ring-success/40" : "text-danger-label ring-danger/40")}>
                {k.delta} <span className="sr-only">{k.good ? "(good)" : "(needs attention)"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {filter && (
        <p className="text-[13px] text-ink-muted">Filtered by <span className="text-ink">{filter}</span> · <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setFilter(null)}>clear</button></p>
      )}

      <div role="tablist" aria-label={`${def.title} views`} className="flex flex-wrap gap-1 border-b border-border/60">
        {def.tabs.map((t, i) => (
          <button key={t.label} role="tab" type="button" aria-selected={i === tab} onClick={() => setTab(i)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors", i === tab ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink")}>{t.label}</button>
        ))}
      </div>

      <div role="tabpanel" className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {current.panels.map((p) => (
          <div key={p.title} className={cn("glass-card rounded-md border p-4", p.wide ? "lg:col-span-7" : "lg:col-span-5")}>
            <h3 className="mb-3 text-[13px] font-semibold text-ink">{p.title}</h3>
            <div className="text-ink-muted"><PanelChart p={p} f={f} /></div>
            {p.insight && (
              <p className="mt-3 flex items-start gap-1.5 rounded-md bg-brand/10 px-2.5 py-2 text-[12px] text-ink"><Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />{p.insight}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
