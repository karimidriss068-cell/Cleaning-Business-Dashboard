"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A requestAnimationFrame loop that runs only while `step` says there is more
 * to do. Call `start()` whenever a target changes; the loop wakes, runs until
 * everything has settled, then sleeps (no idle cost). `step(dt)` gets seconds
 * since the last frame (capped) and returns true to keep going.
 */
export function useFrameLoop(step: (dt: number) => boolean): () => void {
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  const raf = useRef(0);
  const start = useCallback(() => {
    if (raf.current) return;
    let last = 0;
    const run = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      raf.current = stepRef.current(dt) ? requestAnimationFrame(run) : 0;
    };
    raf.current = requestAnimationFrame(run);
  }, []);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );
  return start;
}
