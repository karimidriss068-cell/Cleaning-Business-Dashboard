"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 to `value` on mount/change using an ease-out
 * curve. Respects prefers-reduced-motion by jumping straight to the target.
 */
export function useCountUp(value: number, durationMs = 450): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}
