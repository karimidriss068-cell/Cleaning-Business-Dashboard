import Link from "next/link";
import { microsToCents } from "@/lib/ai/pricing";
import { advisorByKey } from "@/lib/board/advisors";
import { formatCents, formatNyDateTime } from "@/lib/format";
import type { BoardSessionRow } from "@/lib/schemas/board";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatusPill } from "@/components/system/status-pill";

export function SessionsList({ sessions }: { sessions: BoardSessionRow[] }) {
  return (
    <section aria-labelledby="board-past" className="space-y-3" data-testid="board-sessions">
      <h2 id="board-past" className="font-heading text-lg font-medium text-ink">Past sessions</h2>
      {sessions.length === 0 ? (
        <GlassPanel className="p-5 text-sm text-ink-muted">No sessions yet. Ask your first question above.</GlassPanel>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <GlassPanel level="flat" as={Link} href={`/board/${s.id}`} className="block space-y-1.5 p-4 outline-none transition-[border-color,box-shadow] hover:border-brand hover:shadow-[0_0_24px_-8px_var(--kc-glow)] focus-visible:ring-2 focus-visible:ring-ring" data-testid="board-session-link">
                <p className="line-clamp-2 text-sm font-medium text-ink">{s.question}</p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                  <span>{formatNyDateTime(s.created_at)}</span>
                  <span>{s.advisors.map((k) => advisorByKey(k).name).join(", ")}</span>
                  <span>{s.rounds} {s.rounds === 1 ? "round" : "rounds"}</span>
                  <span className="tabular">{formatCents(microsToCents(s.cost_micros))}</span>
                  {s.status === "partial" && <StatusPill tone="warning">Stopped early</StatusPill>}
                  {s.logged_decision_id && <StatusPill tone="success">In decision log</StatusPill>}
                </p>
              </GlassPanel>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
