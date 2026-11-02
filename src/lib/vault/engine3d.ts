// A very small 3D projector for the Vault charts: world points are rotated by
// yaw and pitch, shaded by their face normal and drawn far to near as SVG
// polygons. It exists so the 3D charts need no WebGL or library (about 1 KB
// instead of a ~170 KB gzipped three.js chunk) and stay crisp, accessible
// (real DOM nodes, hoverable) and cheap on phones.

export type Vec = [number, number, number];

export type View = {
  yaw: number;
  pitch: number;
  /** Pixels per world unit at the focal plane. */
  scale: number;
  cx: number;
  cy: number;
  /** Camera distance in world units; larger is flatter. */
  distance: number;
};

export type Face = { pts: Vec[]; normal: Vec; key: string };

export type DrawnFace = { key: string; d: string; light: number; depth: number };

export function rotate([x, y, z]: Vec, yaw: number, pitch: number): Vec {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

/** Screen x, y of a world point, with +z toward the viewer. */
export function project(p: Vec, v: View): [number, number] {
  const [x, y, z] = rotate(p, v.yaw, v.pitch);
  const k = v.distance / (v.distance - z);
  return [v.cx + x * v.scale * k, v.cy - y * v.scale * k];
}

const LIGHT: Vec = (() => {
  const l: Vec = [-0.45, 0.8, 0.55];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/** An upright box standing on y = 0, centred at (cx, cz). */
export function boxFaces(cx: number, cz: number, w: number, d: number, h: number, key: string): Face[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  return [
    { key, normal: [0, 1, 0], pts: [[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]] },
    { key, normal: [0, 0, 1], pts: [[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]] },
    { key, normal: [0, 0, -1], pts: [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]] },
    { key, normal: [1, 0, 0], pts: [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]] },
    { key, normal: [-1, 0, 0], pts: [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]] },
  ];
}

const arcPoint = (r: number, a: number, y: number): Vec => [Math.cos(a) * r, y, Math.sin(a) * r];

/**
 * A slice of a thick ring (a donut segment) between angles a0 and a1, stood on
 * y = 0. Walls are split into short quads so their shading follows the curve.
 */
export function ringSegmentFaces(a0: number, a1: number, rIn: number, rOut: number, h: number, key: string, maxStep = Math.PI / 18): Face[] {
  const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / maxStep));
  const faces: Face[] = [];
  const top: Vec[] = [];
  for (let i = 0; i <= steps; i++) top.push(arcPoint(rOut, a0 + ((a1 - a0) * i) / steps, h));
  for (let i = steps; i >= 0; i--) top.push(arcPoint(rIn, a0 + ((a1 - a0) * i) / steps, h));
  faces.push({ key, normal: [0, 1, 0], pts: top });
  for (let i = 0; i < steps; i++) {
    const s = a0 + ((a1 - a0) * i) / steps;
    const e = a0 + ((a1 - a0) * (i + 1)) / steps;
    const m = (s + e) / 2;
    faces.push({ key, normal: [Math.cos(m), 0, Math.sin(m)], pts: [arcPoint(rOut, s, 0), arcPoint(rOut, e, 0), arcPoint(rOut, e, h), arcPoint(rOut, s, h)] });
    faces.push({ key, normal: [-Math.cos(m), 0, -Math.sin(m)], pts: [arcPoint(rIn, e, 0), arcPoint(rIn, s, 0), arcPoint(rIn, s, h), arcPoint(rIn, e, h)] });
  }
  const cap = (a: number, flip: boolean): Face => {
    const n: Vec = flip ? [Math.sin(a), 0, -Math.cos(a)] : [-Math.sin(a), 0, Math.cos(a)];
    return { key, normal: n, pts: [arcPoint(rIn, a, 0), arcPoint(rOut, a, 0), arcPoint(rOut, a, h), arcPoint(rIn, a, h)] };
  };
  faces.push(cap(a0, false), cap(a1, true));
  return faces;
}

/** Light on a face, 0 (shadow) to 1 (lit), from its rotated normal. */
export function lightOf(normal: Vec, v: Pick<View, "yaw" | "pitch">): number {
  const n = rotate(normal, v.yaw, v.pitch);
  return Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
}

/**
 * Rotate, drop faces turned away, sort far to near and build SVG paths.
 * A face is "away" when its rotated normal points from the camera.
 */
export function drawFaces(faces: Face[], v: View): DrawnFace[] {
  const out: DrawnFace[] = [];
  for (const f of faces) {
    const n = rotate(f.normal, v.yaw, v.pitch);
    if (n[2] <= 0.001) continue;
    let depth = 0;
    const pts = f.pts.map((p) => {
      const r = rotate(p, v.yaw, v.pitch);
      depth += r[2];
      const k = v.distance / (v.distance - r[2]);
      return `${(v.cx + r[0] * v.scale * k).toFixed(1)},${(v.cy - r[1] * v.scale * k).toFixed(1)}`;
    });
    out.push({ key: f.key, d: `M${pts.join("L")}Z`, light: lightOf(f.normal, v), depth: depth / f.pts.length });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/** Share of the "ink" color to keep when shading a chart color (rest is black). 0.45 in shadow to 1 when lit. */
export const shadeShare = (light: number) => 0.42 + 0.58 * Math.min(1, light * 1.15);
