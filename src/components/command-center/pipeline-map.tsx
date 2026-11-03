import Link from "next/link";
import { Fragment } from "react";

export type PipelineStage = {
  id: string;
  label: string;
  stat: string;
  hint?: string;
  href: string;
  tone?: "ok" | "warn" | "danger" | "ai";
  /** Real % into the next stage, only when computable from live data. */
  rate?: { value: number; label: string };
};

const MAIN = ["leads", "schedule", "crews", "invoices", "payouts"];
const FEEDS: Record<string, string> = { ghl: "Leads", agents: "Crews", board: "Invoices" };

const status = (t: PipelineStage["tone"]) =>
  t === "danger" ? { text: "Needs attention", dot: "bg-danger", edge: "before:bg-danger" }
  : t === "warn" ? { text: "Waiting", dot: "bg-warning", edge: "before:bg-warning" }
  : { text: "Healthy", dot: "bg-primary/70", edge: "" };

function Connector({ rate }: { rate?: PipelineStage["rate"] }) {
  return (
    <div aria-hidden className="flex items-center justify-center py-1 lg:w-14 lg:flex-col lg:py-0">
      <div className="h-4 w-px bg-hairline lg:h-px lg:w-full" />
      {rate && (
        <span className="mx-2 text-[11px] tabular-nums whitespace-nowrap text-ink-muted lg:mx-0 lg:mt-1.5" title={rate.label}>
          {Math.round(rate.value)}%
        </span>
      )}
    </div>
  );
}

export function PipelineMap({ stages }: { stages: PipelineStage[] }) {
  const main = MAIN.map((id) => stages.find((s) => s.id === id)).filter((s): s is PipelineStage => !!s);
  const support = stages.filter((s) => !MAIN.includes(s.id));
  const attention = [...main, ...support].filter((s) => s.tone === "warn" || s.tone === "danger");

  return (
    <section aria-labelledby="pipeline-map" className="glass-card rounded-md border p-6" data-testid="pipeline-map">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">Money path</p>
          <h2 id="pipeline-map" className="font-heading text-lg font-medium text-ink">Ops pipeline</h2>
        </div>
        <p className="text-[12px] text-ink-muted">Live counts · click a stage to open it</p>
      </div>

      <ol className="mt-6 flex flex-col lg:flex-row lg:items-stretch">
        {main.map((s, i) => {
          const st = status(s.tone);
          return (
            <Fragment key={s.id}>
              {i > 0 && <Connector rate={main[i - 1].rate} />}
              <li className="min-w-0 lg:flex-1">
                <Link
                  href={s.href}
                  className={`glass-flat relative flex h-full flex-col overflow-hidden rounded-md border p-5 transition-colors hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-primary ${st.edge ? `before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${st.edge}` : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">{s.label}</span>
                    <span className="text-[10px] tabular-nums text-ink-muted/70">0{i + 1}</span>
                  </div>
                  <p className="mt-3 truncate font-heading text-[26px] leading-none font-medium text-ink tabular-nums">{s.stat}</p>
                  <p className="mt-2 truncate text-[12px] text-ink-muted">{s.hint ?? "—"}</p>
                  <p className="mt-auto flex items-center gap-1.5 border-t border-hairline pt-3 text-[12px] text-ink">
                    <span aria-hidden className={`size-1.5 rounded-full ${st.dot}`} />
                    {st.text}
                  </p>
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ol>

      {support.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] tracking-[0.08em] text-ink-muted uppercase">Feeds in</span>
          {support.map((s) => (
            <Link key={s.id} href={s.href} className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink transition-colors hover:bg-surface-raised">
              <span aria-hidden className={`size-1.5 rounded-full ${s.tone === "danger" ? "bg-danger" : "bg-accent2/80"}`} />
              <span className="font-medium">{s.label}</span>
              <span className="text-ink-muted tabular-nums">{s.stat}</span>
              {FEEDS[s.id] && <span className="text-ink-muted">→ {FEEDS[s.id]}</span>}
            </Link>
          ))}
        </div>
      )}

      {attention.length > 0 && (
        <div className="mt-4 rounded-md border border-hairline bg-surface-raised/40 px-4 py-3" data-testid="pipeline-attention">
          <p className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">Needs attention</p>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
            {attention.map((s) => (
              <li key={s.id}>
                <Link href={s.href} className="inline-flex items-center gap-1.5 text-ink hover:underline underline-offset-4">
                  <span aria-hidden className={`size-1.5 rounded-full ${s.tone === "danger" ? "bg-danger" : "bg-warning"}`} />
                  <span className="font-medium">{s.label}</span>
                  <span className="text-ink-muted">{s.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
