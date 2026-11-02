"use client";

import { useEffect, useRef } from "react";

// The Vault background: a slow depth field of dust and three wireframe solids
// drifting behind the glass, shifted by the cursor (nearer things move more).
// Plain canvas 2D with a hand-rolled perspective projection: about 3 KB, no
// WebGL context, no library. It measures its own frame time, thins itself out
// if the machine struggles and stops drawing if that is not enough. Loaded
// only when backdrop.tsx decides the device can afford it.

type V3 = [number, number, number];

const ICO: { v: V3[]; e: [number, number][] } = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  const n = Math.hypot(1, t);
  const v = raw.map(([x, y, z]) => [x / n, y / n, z / n] as V3);
  const e: [number, number][] = [];
  const edge = 2 / n;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (Math.abs(Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) - edge) < 0.01) e.push([i, j]);
  return { v, e };
})();
const OCTA = { v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as V3[], e: [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]] as [number, number][] };
const CUBE = (() => {
  const v: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * 0.6, y * 0.6, z * 0.6]);
  const e: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) if (Math.abs(i ^ j) === 1 || Math.abs(i ^ j) === 2 || Math.abs(i ^ j) === 4) e.push([i, j]);
  return { v, e };
})();

const SOLIDS = [
  { shape: ICO, at: [-1.15, 0.3, -0.9] as V3, size: 0.62, spin: [0.05, 0.08, 0.02] as V3 },
  { shape: OCTA, at: [1.2, -0.28, -1.15] as V3, size: 0.5, spin: [-0.06, 0.05, 0.04] as V3 },
  { shape: CUBE, at: [0.15, 0.72, -1.6] as V3, size: 0.42, spin: [0.04, -0.07, 0.05] as V3 },
];

function rgbOf(css: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) return [166, 123, 91];
  x.fillStyle = "#000";
  x.fillStyle = css;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

export default function SceneCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let quality = 1; // 1 full, 0.5 thinned
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let accent: [number, number, number] = [166, 123, 91];
    let ink: [number, number, number] = [242, 235, 221];
    let dark = true;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      accent = rgbOf(cs.getPropertyValue("--kc-accent").trim() || "#A67B5B");
      ink = rgbOf(cs.getPropertyValue("--kc-text").trim() || "#F2EBDD");
      dark = document.documentElement.classList.contains("dark");
    };
    readColors();
    const mo = new MutationObserver(readColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-direction"] });

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Seeded so the field is the same on every load (no surprise flash).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const DUST = Array.from({ length: 120 }, () => ({ x: (rnd() - 0.5) * 3.6, y: (rnd() - 0.5) * 2.2, z: -1.8 + rnd() * 2.6, r: 0.6 + rnd() * 1.4, p: rnd() * 6.28, s: 0.05 + rnd() * 0.1 }));

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let raf = 0;
    let last = 0;
    let frames = 0;
    let acc = 0;
    let slowStreak = 0;
    let t = 0;
    let stopped = false;
    let secStart = performance.now();
    let secFrames = 0;
    canvas.dataset.state = "running";

    const F = 1.7;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dtMs = last ? now - last : 16.7;
      last = now;
      const dt = Math.min(0.05, dtMs / 1000);
      t += dt;
      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 3);
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 3);

      // Adaptive quality: judge over 90 frames, then thin out once, then stop.
      acc += dtMs;
      frames++;
      if (frames === 90) {
        const avg = acc / frames;
        frames = 0;
        acc = 0;
        if (avg > 22) slowStreak++;
        else slowStreak = 0;
        if (slowStreak === 1 && quality === 1) {
          quality = 0.5;
          dpr = 1;
          resize();
          canvas.dataset.state = "thinned";
        } else if (slowStreak >= 2) {
          stopped = true;
          canvas.dataset.state = "static";
          cancelAnimationFrame(raf);
          return;
        }
      }
      secFrames++;
      if (now - secStart >= 1000) {
        canvas.dataset.fps = String(Math.round((secFrames * 1000) / (now - secStart)));
        secFrames = 0;
        secStart = now;
      }

      ctx.clearRect(0, 0, w, h);
      const cam = { x: mouse.x * 0.2, y: mouse.y * 0.12 };
      const scale = Math.min(w, h * 1.5) * 0.62;
      const proj = (x: number, y: number, z: number): [number, number, number] => {
        // Nearer things shift more with the cursor (parallax), then perspective.
        const px = x - cam.x * (1.5 + z);
        const py = y - cam.y * (1.5 + z);
        const k = F / (F - z);
        return [w / 2 + px * scale * k, h * 0.46 + py * scale * k, k];
      };

      // Dust
      const n = Math.round(DUST.length * quality);
      const [ar, ag, ab] = accent;
      const [ir, ig, ib] = ink;
      for (let i = 0; i < n; i++) {
        const d = DUST[i];
        const y = d.y + Math.sin(t * d.s * 3 + d.p) * 0.05;
        const x = d.x + Math.cos(t * d.s * 2 + d.p) * 0.04;
        const [sx, sy, k] = proj(x, y, d.z);
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
        const depth = (d.z + 1.8) / 2.6; // 0 far .. 1 near
        const a = (dark ? 0.1 : 0.12) + depth * (dark ? 0.32 : 0.28);
        ctx.fillStyle = i % 5 === 0 ? `rgba(${ir},${ig},${ib},${a * 0.8})` : `rgba(${ar},${ag},${ab},${a})`;
        ctx.beginPath();
        ctx.arc(sx, sy, d.r * k * (0.7 + depth * 0.6), 0, 6.283);
        ctx.fill();
      }

      // Wireframe solids
      for (let s = 0; s < SOLIDS.length; s++) {
        const o = SOLIDS[s];
        const ax = t * o.spin[0];
        const ay = t * o.spin[1];
        const az = t * o.spin[2];
        const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
        const pts = o.shape.v.map(([vx, vy, vz]) => {
          let x = vx, y = vy * cx - vz * sx, z = vy * sx + vz * cx;
          const x2 = x * cy + z * sy;
          z = -x * sy + z * cy;
          x = x2 * cz - y * sz;
          y = x2 * sz + y * cz;
          return proj(o.at[0] + x * o.size, o.at[1] + y * o.size + Math.sin(t * 0.2 + s) * 0.03, o.at[2] + z * o.size);
        });
        const depth = (o.at[2] + 1.8) / 2.6;
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${(dark ? 0.16 : 0.2) + depth * 0.16})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [i, j] of o.shape.e) {
          ctx.moveTo(pts[i][0], pts[i][1]);
          ctx.lineTo(pts[j][0], pts[j][1]);
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(${ir},${ig},${ib},${dark ? 0.35 : 0.3})`;
        for (const p of pts) ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        last = 0;
      } else if (!stopped) {
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden data-testid="vault-scene" className="kc-vault-canvas" />;
}
