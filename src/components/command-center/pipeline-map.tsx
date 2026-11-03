"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";

export type PipelineStage = {
  id: string;
  label: string;
  stat: string;
  hint?: string;
  href: string;
  tone?: "ok" | "warn" | "danger" | "ai";
};

type StageData = PipelineStage & { step?: number; support?: boolean };
type StageNode = Node<StageData, "stage">;

// Soft rings only when something needs attention; healthy stages stay quiet.
const toneRing: Record<NonNullable<PipelineStage["tone"]>, string> = {
  ok: "",
  warn: "ring-1 ring-warning/50",
  danger: "ring-1 ring-danger/60",
  ai: "",
};
const toneDot: Record<NonNullable<PipelineStage["tone"]>, string> = {
  ok: "bg-primary/70",
  warn: "bg-warning",
  danger: "bg-danger",
  ai: "bg-accent2/80",
};

const hidden = "!pointer-events-none !size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0";

function StageCard({ data }: NodeProps<StageNode>) {
  const tone = data.tone ?? "ok";
  if (data.support) {
    return (
      <div className="glass-flat flex w-[200px] cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors hover:bg-surface-raised">
        <Handle type="source" position={Position.Top} className={hidden} isConnectable={false} />
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">{data.label}</p>
          <p className="truncate text-[12px] text-ink">
            <span className="tabular-nums font-medium">{data.stat}</span>
            {data.hint && <span className="text-ink-muted"> · {data.hint}</span>}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className={`glass-card group w-[200px] cursor-pointer rounded-md border px-4 pt-3 pb-3.5 shadow-e1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-e2 ${toneRing[tone]}`}>
      <Handle type="target" position={Position.Left} className={hidden} isConnectable={false} />
      <Handle type="target" id="bottom" position={Position.Bottom} className={hidden} isConnectable={false} />
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">{data.label}</p>
        <span className="text-[10px] tabular-nums text-ink-muted/70">0{data.step}</span>
      </div>
      <p className="mt-2 font-heading text-[26px] leading-none font-medium text-ink tabular-nums">{data.stat}</p>
      <p className="mt-2.5 flex items-center gap-1.5 truncate text-[12px] text-ink-muted">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />
        <span className="truncate">{data.hint ?? "—"}</span>
      </p>
      <Handle type="source" position={Position.Right} className={hidden} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { stage: StageCard };

// Designed, fixed layout: money path as a 5-stage rail (200px cards, 48px gutters),
// support systems as a quiet row beneath, each feeding one stage.
const MAIN = ["leads", "schedule", "crews", "invoices", "payouts"];
const STEP = 248;
const LAYOUT: Record<string, { x: number; y: number }> = {
  ...Object.fromEntries(MAIN.map((id, i) => [id, { x: i * STEP, y: 0 }])),
  ghl: { x: 0 * STEP, y: 196 },
  agents: { x: 2 * STEP, y: 196 },
  board: { x: 3 * STEP, y: 196 },
};
const SUPPORT: Array<[string, string]> = [
  ["ghl", "leads"],
  ["agents", "crews"],
  ["board", "invoices"],
];

export function PipelineMap({ stages }: { stages: PipelineStage[] }) {
  const router = useRouter();
  const ids = useMemo(() => new Set(stages.map((s) => s.id)), [stages]);

  const nodes = useMemo<StageNode[]>(
    () =>
      stages
        .filter((s) => LAYOUT[s.id])
        .map((s) => {
          const step = MAIN.indexOf(s.id);
          return { id: s.id, type: "stage", position: LAYOUT[s.id], data: { ...s, step: step + 1, support: step < 0 } };
        }),
    [stages],
  );

  const edges = useMemo<Edge[]>(() => {
    const main: Edge[] = MAIN.slice(0, -1)
      .map((a, i) => [a, MAIN[i + 1]] as const)
      .filter(([a, b]) => ids.has(a) && ids.has(b))
      .map(([a, b]) => ({
        id: `${a}-${b}`, source: a, target: b, type: "straight",
        style: { stroke: "var(--color-primary)", strokeWidth: 1.5, opacity: 0.7 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-primary)", width: 14, height: 14 },
      }));
    const support: Edge[] = SUPPORT.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b]) => ({
      id: `${a}-${b}`, source: a, target: b, targetHandle: "bottom", type: "straight",
      style: { stroke: "var(--color-ink-muted)", strokeWidth: 1, strokeDasharray: "3 4", opacity: 0.55 },
    }));
    return [...main, ...support];
  }, [ids]);

  return (
    <section aria-labelledby="pipeline-map" className="glass-card rounded-md border p-6" data-testid="pipeline-map">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium tracking-[0.1em] text-ink-muted uppercase">Money path</p>
          <h2 id="pipeline-map" className="font-heading text-lg font-medium text-ink">Ops pipeline</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-2"><span aria-hidden className="h-px w-5 bg-primary/70" /> Job flow</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden className="w-5 border-t border-dashed border-ink-muted/60" /> Feeds into</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden className="size-1.5 rounded-full bg-warning" /> Needs attention</span>
        </div>
      </div>
      <div className="kc-flow mt-6 h-[320px] w-full overflow-x-auto">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.06 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => router.push((n.data as PipelineStage).href)}
          minZoom={0.5}
          maxZoom={1.1}
          style={{ background: "transparent" }}
        />
      </div>
      <p className="mt-4 text-[12px] text-ink-muted">Live counts. Click any stage to open it.</p>
    </section>
  );
}
