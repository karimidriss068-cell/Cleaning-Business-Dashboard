// A critically-damped-ish spring for the 3D chart rotation, tooltip and tilt.
// Semi-implicit Euler with a fixed sub-step so a slow frame can't blow it up.

export type Spring = { x: number; v: number };

export function stepSpring(s: Spring, target: number, dt: number, stiffness = 140, damping = 18): Spring {
  let { x, v } = s;
  let left = Math.min(dt, 0.064);
  while (left > 0) {
    const h = Math.min(left, 1 / 240);
    v += (-stiffness * (x - target) - damping * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

export const settled = (s: Spring, target: number, eps = 0.0005) => Math.abs(s.x - target) < eps && Math.abs(s.v) < eps;
