"use client";

import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";

export type PipelineStage = {
  id: string;
  label: string;
  stat: string;
  hint?: string;
  href: string;
  tone?: "ok" | "warn" | "danger" | "ai";
};

type StageNode = Node<PipelineStage, "stage">;

const toneRing: Record<NonNullable<PipelineStage["tone"]>, string> = {
  ok: "ring-1 ring-primary/30",
  warn: "ring-1 ring-warning/60",
  danger: "ring-1 ring-danger/70",
  ai: "ring-1 ring-accent2/60",
};

function StageCard({ data }: NodeProps<StageNode>) {
  return (
    <div className={`glass-card w-[170px] cursor-pointer rounded-md border px-3 py-2.5 shadow-e1 transition-transform hover:-translate-y-0.5 ${toneRing[data.tone ?? "ok"]}`}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-primary/60" />
      <Handle type="target" id="top" position={Position.Top} className="!size-2 !border-0 !bg-primary/60" />
      <p className="text-[11px] tracking-wide text-ink-muted uppercase">{data.label}</p>
      <p className="font-heading text-lg leading-tight font-medium text-ink tabular-nums">{data.stat}</p>
      {data.hint && <p className="truncate text-[11px] text-ink-muted">{data.hint}</p>}
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-primary/60" />
      <Handle type="source" id="bottom" position={Position.Bottom} className="!size-2 !border-0 !bg-primary/60" />
    </div>
  );
}

const nodeTypes = { stage: StageCard };

// Main money path on one row; the systems feeding it (GHL sync, Agents, Roast Room) beneath.
const LAYOUT: Record<string, { x: number; y: number }> = {
  leads: { x: 0, y: 0 },
  schedule: { x: 220, y: 0 },
  crews: { x: 440, y: 0 },
  invoices: { x: 660, y: 0 },
  payouts: { x: 880, y: 0 },
  ghl: { x: 110, y: 170 },
  agents: { x: 440, y: 170 },
  board: { x: 770, y: 170 },
};

const FLOW: Array<[string, string, string]> = [
  ["leads", "schedule", "booked"],
  ["schedule", "crews", "assigned"],
  ["crews", "invoices", "completed"],
  ["invoices", "payouts", "collected"],
];
const SUPPORT: Array<[string, string, string]> = [
  ["ghl", "leads", "contacts in"],
  ["ghl", "schedule", "stage sync"],
  ["agents", "leads", "follow-ups"],
  ["agents", "crews", "dispatch"],
  ["board", "invoices", "pricing calls"],
];

const label = { labelStyle: { fill: "var(--color-ink-muted)", fontSize: 11 }, labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.85 } };

export function PipelineMap({ stages }: { stages: PipelineStage[] }) {
  const router = useRouter();
  const ids = useMemo(() => new Set(stages.map((s) => s.id)), [stages]);

  const nodes = useMemo<StageNode[]>(
    () => stages.filter((s) => LAYOUT[s.id]).map((s) => ({ id: s.id, type: "stage", position: LAYOUT[s.id], data: s })),
    [stages],
  );

  const edges = useMemo<Edge[]>(() => {
    const main: Edge[] = FLOW.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, l]) => ({
      id: `${a}-${b}`, source: a, target: b, label: l, animated: true,
      style: { stroke: "var(--color-primary)", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--color-primary)" },
      ...label,
    }));
    const support: Edge[] = SUPPORT.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([a, b, l]) => ({
      id: `${a}-${b}`, source: a, target: b, targetHandle: "top", label: l,
      style: { stroke: "var(--color-ink-muted)", strokeWidth: 1.25, strokeDasharray: "5 4" },
      markerEnd: { type: MarkerType.Arrow, color: "var(--color-ink-muted)" },
      ...label,
    }));
    return [...main, ...support];
  }, [ids]);

  return (
    <section aria-labelledby="pipeline-map" className="glass-card space-y-2 rounded-md border p-4" data-testid="pipeline-map">
      <div>
        <h2 id="pipeline-map" className="font-heading text-lg font-medium text-ink">Ops pipeline</h2>
        <p className="text-[12px] text-ink-muted">Lead → schedule → crew → invoice → payout, with the systems feeding it. Live counts; click a stage to open it.</p>
      </div>
      <div className="kc-flow h-[340px] w-full overflow-hidden rounded-md border border-hairline">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => router.push((n.data as PipelineStage).href)}
          minZoom={0.4}
          maxZoom={1.6}
          style={{ background: "transparent" }}
        >
          <Background gap={22} size={1} color="var(--color-hairline)" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
    </section>
  );
}
