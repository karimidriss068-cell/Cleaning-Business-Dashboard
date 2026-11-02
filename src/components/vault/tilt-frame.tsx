"use client";

import { useRef } from "react";
import { useFrameLoop } from "@/lib/vault/use-frame-loop";
import { cn } from "@/lib/utils";
import { stepSpring, type Spring } from "@/lib/vault/spring";

/**
 * Tilts its child a few degrees toward the cursor on a spring, moves a soft
 * light reflection with it and parallaxes children marked `kc-depth`. Only for
 * a mouse in the Vault direction; touch, reduced motion and the other
 * directions get a plain static box. It animates only while the pointer is
 * over it (one rAF loop, transform and opacity only), so a page of tiles costs
 * nothing at rest.
 */
export function TiltFrame({ children, className, max = 5 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = useRef<{ rx: Spring; ry: Spring; px: Spring; py: Spring; t: { rx: number; ry: number; px: number; py: number } }>({
    rx: { x: 0, v: 0 },
    ry: { x: 0, v: 0 },
    px: { x: 0, v: 0 },
    py: { x: 0, v: 0 },
    t: { rx: 0, ry: 0, px: 0, py: 0 },
  });

  const kick = useFrameLoop((dt) => {
    const el = ref.current;
    const st = s.current;
    if (!el) return false;
    st.rx = stepSpring(st.rx, st.t.rx, dt, 170, 20);
    st.ry = stepSpring(st.ry, st.t.ry, dt, 170, 20);
    st.px = stepSpring(st.px, st.t.px, dt, 120, 18);
    st.py = stepSpring(st.py, st.t.py, dt, 120, 18);
    el.style.transform = `perspective(900px) rotateX(${st.rx.x.toFixed(2)}deg) rotateY(${st.ry.x.toFixed(2)}deg)`;
    el.style.setProperty("--px", st.px.x.toFixed(3));
    el.style.setProperty("--py", st.py.x.toFixed(3));
    const target = [st.t.rx, st.t.ry, st.t.px, st.t.py];
    return [st.rx, st.ry, st.px, st.py].some((p, i) => Math.abs(p.x - target[i]) > 0.01 || Math.abs(p.v) > 0.01);
  });

  const enabled = () =>
    document.documentElement.dataset.direction === "vault" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      ref={ref}
      className={cn("kc-tilt", className)}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !enabled()) return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
        s.current.t = { rx: -ny * max, ry: nx * max, px: nx, py: ny };
        el.style.setProperty("--mx", `${((nx + 1) / 2) * 100}%`);
        el.style.setProperty("--my", `${((ny + 1) / 2) * 100}%`);
        el.style.setProperty("--glare", "1");
        kick();
      }}
      onPointerLeave={() => {
        s.current.t = { rx: 0, ry: 0, px: 0, py: 0 };
        ref.current?.style.setProperty("--glare", "0");
        kick();
      }}
    >
      {children}
    </div>
  );
}
