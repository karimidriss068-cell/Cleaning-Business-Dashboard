"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion/hooks";
import { useFrameLoop } from "@/lib/vault/use-frame-loop";
import { boxFaces, drawFaces, project, ringSegmentFaces, shadeShare, type Face, type View } from "@/lib/vault/engine3d";
import { stepSpring, type Spring } from "@/lib/vault/spring";

export type Chart3DDatum = { key: string; label: string; cents: number };
type Mode = "bars" | "donut";

const W = 640;
const H = 330;
const TONES = ["var(--kc-chart1)", "var(--kc-chart2)", "var(--kc-chart3)", "var(--kc-chart4)", "var(--kc-chart5)", "var(--kc-accent)"];
const DEFAULT = { yaw: { bars: -0.5, donut: 0.35 }, pitch: { bars: 0.5, donut: 0.78 } };

const dollars = (c: number) => formatCents(Math.round(c / 100) * 100, { hideZeroCents: true });

/**
 * Revenue by channel as an orbitable 3D bar or donut chart, drawn with a tiny
 * projector (src/lib/vault/engine3d.ts) into real SVG, so it needs no WebGL
 * and every slice is a hoverable, focusable, readable element. Drag to rotate
 * (springs settle it), hover or focus a legend row to light up its piece, and
 * arrow keys nudge the view. Reduced motion and phones get the same chart
 * without growth, idle sway or inertia.
 */
export function Chart3D({ data, title, ariaLabel }: { data: Chart3DDatum[]; title: string; ariaLabel: string }) {
  const [mode, setMode] = useState<Mode>("bars");
  const [hot, setHot] = useState<string | null>(null);
  const [anim, setAnim] = useState({ yaw: DEFAULT.yaw.bars, pitch: DEFAULT.pitch.bars, grow: 0 });
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  // Spring state lives in a ref and is only touched by the frame loop and event handlers, never during render.
  const sp = useRef({
    yaw: { x: DEFAULT.yaw.bars, v: 0 } as Spring,
    pitch: { x: DEFAULT.pitch.bars, v: 0 } as Spring,
    grow: { x: 0, v: 0 } as Spring,
    ty: DEFAULT.yaw.bars,
    tp: DEFAULT.pitch.bars,
    tg: 0,
    drag: null as null | { x: number; y: number; ty: number; tp: number },
    sway: 0,
    tipX: { x: 0, v: 0 } as Spring,
    tipY: { x: 0, v: 0 } as Spring,
    tipT: { x: 0, y: 0 },
    visible: false,
  });

  const total = data.reduce((a, d) => a + d.cents, 0);
  const max = Math.max(1, ...data.map((d) => d.cents));

  const kick = useFrameLoop((dt) => {
    const s = sp.current;
    if (!s.drag && s.sway > 0) {
      s.ty += dt * 0.07 * Math.min(1, s.sway / 2); // a slow introductory drift that eases out after a few seconds
      s.sway -= dt;
    }
    s.yaw = stepSpring(s.yaw, s.ty, dt, 90, 15);
    s.pitch = stepSpring(s.pitch, s.tp, dt, 90, 15);
    s.grow = stepSpring(s.grow, s.tg, dt, 70, 13);
    s.tipX = stepSpring(s.tipX, s.tipT.x, dt, 240, 26);
    s.tipY = stepSpring(s.tipY, s.tipT.y, dt, 240, 26);
    if (tip.current) tip.current.style.transform = `translate3d(${s.tipX.x.toFixed(1)}px,${s.tipY.x.toFixed(1)}px,0)`;
    setAnim({ yaw: s.yaw.x, pitch: s.pitch.x, grow: s.grow.x });
    const moving =
      Math.abs(s.yaw.x - s.ty) > 0.0008 || Math.abs(s.pitch.x - s.tp) > 0.0008 || Math.abs(s.grow.x - s.tg) > 0.0008 || Math.abs(s.yaw.v) > 0.002 || Math.abs(s.grow.v) > 0.002 ||
      Math.abs(s.tipX.x - s.tipT.x) > 0.3 || Math.abs(s.tipY.x - s.tipT.y) > 0.3;
    return s.visible && (moving || s.sway > 0);
  });

  // Grow in once the chart is on screen; do no work while it is off screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const s = sp.current;
    const io = new IntersectionObserver((es) => {
      s.visible = es.some((e) => e.isIntersecting);
      if (!s.visible) return;
      if (s.tg !== 1) {
        s.tg = 1;
        if (reduced) s.grow = { x: 1, v: 0 };
        else s.sway = 6;
      }
      kick();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [kick, reduced]);

  const switchMode = (m: Mode) => {
    const s = sp.current;
    setMode(m);
    s.ty = DEFAULT.yaw[m];
    s.tp = DEFAULT.pitch[m];
    s.sway = 0;
    if (!reduced) s.grow = { x: 0.15, v: 0 };
    kick();
  };

  const view: View = { yaw: anim.yaw, pitch: anim.pitch, scale: mode === "bars" ? 62 : 70, cx: W / 2, cy: mode === "bars" ? 190 : 175, distance: 11 };
  const g = Math.min(1.04, Math.max(0, anim.grow));

  const faces = useMemo(() => {
    const out: Face[] = [];
    const n = data.length;
    if (mode === "bars") {
      const step = 1.05;
      const x0 = -((n - 1) * step) / 2;
      data.forEach((d, i) => out.push(...boxFaces(x0 + i * step, 0, 0.74, 0.74, Math.max(0.05, (d.cents / max) * 3.2), d.key)));
    } else {
      let a = -Math.PI / 2;
      data.forEach((d) => {
        const sweep = total > 0 ? (d.cents / total) * Math.PI * 2 : 0;
        if (sweep > 0.005) out.push(...ringSegmentFaces(a, a + Math.max(0.004, sweep - 0.012), 1.25, 2.3, 0.55, d.key));
        a += sweep;
      });
    }
    return out;
  }, [data, mode, max, total]);

  // The grow factor scales bar heights or ring heights on the drawn geometry.
  const drawn = (() => {
    const k = mode === "bars" ? g : 0.25 + 0.75 * g;
    const scaled: Face[] = faces.map((f) => ({ ...f, pts: f.pts.map(([x, y, z]) => [x, y * k, z] as [number, number, number]) }));
    return drawFaces(scaled, view);
  })();

  const idx = (key: string) => data.findIndex((d) => d.key === key);
  const fill = (key: string, light: number) => {
    const base = TONES[idx(key) % TONES.length];
    const share = Math.round(shadeShare(light) * 100);
    const mixed = `color-mix(in oklab, ${base} ${share}%, black)`;
    return hot === key ? `color-mix(in oklab, ${mixed} 82%, white)` : mixed;
  };

  const labels = mode === "bars" ? data.map((d, i) => {
    const step = 1.05;
    const x0 = -((data.length - 1) * step) / 2;
    const [x, y] = project([x0 + i * step, 0, 0.62], view);
    return { key: d.key, x, y: y + 16, text: d.label };
  }) : [];

  const onDown = (e: React.PointerEvent) => {
    const s = sp.current;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    s.drag = { x: e.clientX, y: e.clientY, ty: s.ty, tp: s.tp };
    s.sway = 0;
    kick();
  };
  const onMove = (e: React.PointerEvent) => {
    const s = sp.current;
    const rect = wrap.current?.getBoundingClientRect();
    if (rect) {
      s.tipT = { x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 48 };
      if (reduced) {
        s.tipX = { x: s.tipT.x, v: 0 };
        s.tipY = { x: s.tipT.y, v: 0 };
      }
    }
    if (s.drag) {
      s.ty = s.drag.ty + (e.clientX - s.drag.x) * 0.012;
      s.tp = Math.min(1.25, Math.max(0.15, s.drag.tp + (e.clientY - s.drag.y) * 0.008));
    }
    kick();
  };
  const onUp = () => {
    sp.current.drag = null;
    kick();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const s = sp.current;
    const k = e.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(k)) return;
    e.preventDefault();
    s.sway = 0;
    if (k === "ArrowLeft") s.ty -= 0.25;
    if (k === "ArrowRight") s.ty += 0.25;
    if (k === "ArrowUp") s.tp = Math.min(1.25, s.tp + 0.12);
    if (k === "ArrowDown") s.tp = Math.max(0.15, s.tp - 0.12);
    if (k === "Home") {
      s.ty = DEFAULT.yaw[mode];
      s.tp = DEFAULT.pitch[mode];
    }
    kick();
  };

  const hotDatum = data.find((d) => d.key === hot);

  return (
    <div ref={wrap} className="relative" data-testid="chart-3d" data-mode={mode}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-base font-medium text-ink">{title}</h3>
        <div role="radiogroup" aria-label="Chart shape" className="inline-flex items-center rounded-full border border-hairline bg-surface-raised/70 p-0.5">
          {(["bars", "donut"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} data-testid={`chart3d-${m}`} onClick={() => switchMode(m)} className={cn("kc-press h-7 rounded-full px-3 text-[13px] font-medium capitalize transition-colors duration-fast", mode === m ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink")}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 grid items-center gap-4 md:grid-cols-[minmax(0,640px)_minmax(14rem,1fr)]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          data-testid="chart-3d-svg"
          data-yaw={view.yaw.toFixed(3)}
          className="block h-auto w-full touch-pan-y cursor-grab select-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:cursor-grabbing"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setHot(null)}
          onKeyDown={onKey}
        >
          <ellipse cx={W / 2} cy={mode === "bars" ? 196 : 232} rx={mode === "bars" ? 250 : 190} ry={mode === "bars" ? 62 : 46} style={{ fill: "var(--kc-text)" }} opacity={0.05} />
          {drawn.map((f, i) => (
            <path
              key={`${f.key}-${i}`}
              d={f.d}
              style={{ fill: fill(f.key, f.light), stroke: "color-mix(in oklab, var(--kc-canvas) 55%, transparent)", strokeWidth: 0.8, transition: "fill 160ms" }}
              onPointerEnter={() => setHot(f.key)}
            />
          ))}
          {labels.map((l) => (
            <text key={l.key} x={l.x} y={l.y} textAnchor="middle" className="fill-ink-muted" style={{ fontSize: 12 }} opacity={anim.grow > 0.6 ? 1 : 0}>
              {l.text}
            </text>
          ))}
        </svg>
        <ul className="space-y-1" data-testid="chart-3d-legend">
          {data.map((d, i) => (
            <li key={d.key}>
              <button
                type="button"
                onPointerEnter={() => setHot(d.key)}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot(d.key)}
                onBlur={() => setHot(null)}
                className={cn("kc-press flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-fast", hot === d.key ? "bg-surface-raised" : "hover:bg-surface-raised/60")}
              >
                <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: TONES[i % TONES.length] }} />
                <span className="min-w-0 flex-1 truncate text-ink">{d.label}</span>
                <span className="font-medium text-ink tabular">{dollars(d.cents)}</span>
                <span className="w-9 text-right text-[12px] text-ink-muted tabular">{total > 0 ? Math.round((d.cents / total) * 100) : 0}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div ref={tip} aria-hidden className={cn("pointer-events-none absolute top-0 left-0 z-10 rounded-sm border border-hairline glass-popover px-2.5 py-1.5 text-[12px] whitespace-nowrap text-ink tabular transition-opacity duration-fast", hotDatum ? "opacity-100" : "opacity-0")}>
        {hotDatum && (
          <>
            <span className="font-medium">{hotDatum.label}</span> · {dollars(hotDatum.cents)} · {total > 0 ? Math.round((hotDatum.cents / total) * 100) : 0}%
          </>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-muted">Drag to rotate · arrow keys nudge the view</p>
    </div>
  );
}
