import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { budgetAlerts, scopeLabel, type AiSummary } from "@/lib/ai/budget";
import { formatCents } from "@/lib/format";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";

/** Command Center (owner only): shown when any AI cap is at 80% or more, or the kill switch is on. Silent otherwise. */
export function AiBudgetBanner({ summary }: { summary: AiSummary }) {
  const alerts = budgetAlerts(summary);
  if (alerts.length === 0 && !summary.kill_switch) return null;
  const worst = alerts[0];
  return (
    <GlassPanel as="section" aria-label="AI budget" level="flat" role="status" className="kc-enter p-4" data-testid="ai-budget-banner">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-base font-medium text-ink"><Sparkles className="size-4 text-brand-text" aria-hidden /> AI budget</h2>
        <StatusPill tone={summary.kill_switch || worst?.over ? "danger" : "warning"}>{summary.kill_switch ? "AI is off" : worst?.over ? "Cap reached" : "Nearing a cap"}</StatusPill>
      </div>
      <ul className="mt-2 space-y-1 text-[13px] text-ink-muted">
        {alerts.slice(0, 3).map((a) => (
          <li key={`${a.scope}-${a.key}-${a.window}`}><span className="text-ink">{scopeLabel[a.scope]} {a.key === "*" ? "(each)" : a.key}</span> · {formatCents(a.spentCents)} of {formatCents(a.capCents)} {a.window === "daily" ? "today" : "this month"} ({Math.floor(a.percent)}%)</li>
        ))}
        {alerts.length > 3 && <li>and {alerts.length - 3} more</li>}
      </ul>
      <Link href="/settings/ai-usage" className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-brand-text outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        AI usage <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </GlassPanel>
  );
}
