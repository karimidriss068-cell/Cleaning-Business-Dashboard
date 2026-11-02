import { microsToCents } from "@/lib/ai/pricing";
import { advisorByKey, AI_LABEL } from "@/lib/board/advisors";
import type { BoardSessionRow } from "@/lib/schemas/board";
import { AnimatedNumber } from "@/components/system/animated-number";
import { GlassPanel } from "@/components/system/glass-panel";
import { StatTile } from "@/components/system/stat-tile";
import { StatusPill } from "@/components/system/status-pill";
import { SynthesisPanel } from "@/components/board/synthesis-panel";
import { Boardroom, StyleSwitcher } from "@/components/board/scene/boardroom";
import type { SceneStyle } from "@/components/board/scene/styles";
import { buildScript } from "@/lib/board/scene/script";
import { sceneFromSession } from "@/lib/board/scene/from-session";

/** One saved session: the question, what it cost, each advisor's answer by round, and the synthesis. */
export function SessionView({ session, style = "a" }: { session: BoardSessionRow; style?: SceneStyle }) {
  const rounds = Array.from({ length: session.rounds }, (_, i) => i + 1);
  // Replayed from what was saved: no model is called to watch it.
  const scene = sceneFromSession(session);
  return (
    <div className="space-y-6" data-testid="board-session">
      <GlassPanel as="section" aria-labelledby="board-q" className="kc-enter space-y-2 p-5">
        <h2 id="board-q" className="font-heading text-lg font-medium text-ink">The question</h2>
        <p className="text-sm whitespace-pre-wrap text-ink">{session.question}</p>
        <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
          {session.status === "partial" && <StatusPill tone="warning">Stopped early</StatusPill>}
          {session.use_context && <StatusPill tone="neutral">Included business snapshot</StatusPill>}
        </p>
      </GlassPanel>

      {scene && (
        <section aria-labelledby="board-room" className="space-y-3" data-testid="board-room">
          <div>
            <h2 id="board-room" className="font-heading text-lg font-medium text-ink">The boardroom — live debate</h2>
            <p className="text-[13px] text-ink-muted">Your question, debated live: each advisor takes the floor, the others agree or push back, everyone votes, then the chair rules. Played from this session&apos;s real answers; nothing is re-sent to an AI.</p>
          </div>
          <StyleSwitcher current={style} />
          <Boardroom key={style} script={buildScript(scene)} advisors={scene.advisors} style={style} />
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3" data-testid="board-cost">
        <StatTile index={1} label="Cost of this session" figure={{ value: microsToCents(session.cost_micros), kind: "cents" }} hint="Counted against the AI caps" />
        <StatTile index={2} label="Estimate was up to" figure={{ value: microsToCents(session.est_micros), kind: "cents" }} hint="The most it could have cost" />
        <StatTile index={3} label="Advisors" figure={{ value: session.advisors.length, kind: "count" }} hint={`${session.rounds} ${session.rounds === 1 ? "round" : "rounds"}`} />
      </div>
      {session.status === "partial" && (
        <GlassPanel level="popover" role="status" className="p-4 text-sm text-ink" data-testid="board-partial">
          This session stopped early (a spending limit, the AI switch or a provider problem). What finished is shown, and it cost <AnimatedNumber value={microsToCents(session.cost_micros)} kind="cents" />.
        </GlassPanel>
      )}


      {rounds.map((round) => (
        <section key={round} aria-labelledby={`board-round-${round}`} className="space-y-3" data-testid="board-round">
          <h2 id={`board-round-${round}`} className="font-heading text-lg font-medium text-ink">{session.rounds === 1 ? "Full answers" : round === 1 ? "Round 1: first answers" : "Round 2: after hearing each other"}</h2>
          <p className="text-[12px] text-ink-muted">{AI_LABEL}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {session.advisor_outputs.filter((o) => o.round === round).map((o) => {
              const a = advisorByKey(o.advisor);
              return (
                <GlassPanel key={`${o.advisor}-${o.round}`} level="flat" className="kc-enter space-y-2 p-4" data-testid="board-advisor-card">
                  <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">{a.name} <StatusPill tone="neutral">AI</StatusPill></h3>
                  <p className="text-[12px] text-ink-muted">{a.question}</p>
                  <p className="text-sm whitespace-pre-wrap text-ink">{o.text}</p>
                </GlassPanel>
              );
            })}
          </div>
        </section>
      ))}

      <SynthesisPanel session={session} />
    </div>
  );
}
