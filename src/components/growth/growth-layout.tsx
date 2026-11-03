"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassPanel } from "@/components/system/glass-panel";
import { Sparkline } from "@/components/system/sparkline";
import { cn } from "@/lib/utils";

export type GrowthKpi = { label: string; value: string; hint?: string; tone?: "success" | "warning" | "danger" | "neutral"; spark?: number[] };

const toneText: Record<NonNullable<GrowthKpi["tone"]>, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-ink-muted",
};

export const GROWTH_SECTIONS = [
  { id: "pace", label: "Pace" },
  { id: "money", label: "Money" },
  { id: "acquisition", label: "Acquisition" },
  { id: "funnel", label: "Funnel" },
  { id: "operations", label: "Operations" },
] as const;

/** Sticky header: six compact KPIs plus a jump-nav that tracks the section in view. */
export function GrowthStickyBar({ kpis }: { kpis: GrowthKpi[] }) {
  const [active, setActive] = useState<string>(GROWTH_SECTIONS[0].id);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-180px 0px -55% 0px" },
    );
    GROWTH_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
  return (
    <div className="sticky top-0 z-20 -mx-4 space-y-2 border-b border-hairline bg-canvas/80 px-4 pt-3 pb-2 backdrop-blur-xl md:-mx-6 md:px-6" data-testid="growth-sticky">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" data-testid="growth-kpis">
        {kpis.map((k) => (
          <GlassPanel as="div" key={k.label} className="flex min-w-0 items-end justify-between gap-2 px-3 py-2.5" title={k.hint}>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase">{k.label}</p>
              <p className="font-heading text-xl leading-7 font-medium tracking-[-0.02em] text-ink tabular">{k.value}</p>
              {k.hint && <p className={cn("truncate text-[11px]", toneText[k.tone ?? "neutral"])}>{k.hint}</p>}
            </div>
            {k.spark && k.spark.length > 1 && <Sparkline values={k.spark} width={64} height={28} className="shrink-0" />}
          </GlassPanel>
        ))}
      </div>
      <nav aria-label="Growth sections" className="flex gap-1 overflow-x-auto">
        {GROWTH_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              history.replaceState(null, "", `#${s.id}`);
            }}
            aria-current={active === s.id ? "true" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors",
              active === s.id ? "bg-info-soft text-brand-text ring-1 ring-brand/30" : "text-ink-muted hover:text-ink",
            )}
          >
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** One dense card per section, with optional inner tabs. Description lives in a tooltip. */
export function GrowthBlock({ id, title, info, tabs, children, actions }: { id: string; title: string; info?: string; tabs?: { key: string; label: string; content: React.ReactNode }[]; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-44 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="inline-flex items-center gap-1.5 font-heading text-lg font-medium text-ink">
          {title}
          {info && (
            <span title={info} aria-label={info} className="text-ink-muted"><Info className="size-3.5" aria-hidden /></span>
          )}
        </h2>
        {actions}
      </div>
      {tabs ? (
        <Tabs defaultValue={tabs[0].key}>
          <TabsList variant="line">
            {tabs.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
          </TabsList>
          {tabs.map((t) => <TabsContent key={t.key} value={t.key} className="pt-3">{t.content}</TabsContent>)}
        </Tabs>
      ) : null}
      {children}
    </section>
  );
}
