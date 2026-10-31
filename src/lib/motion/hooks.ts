"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** True when the person asked for no motion. Server and first paint say false; CSS covers that gap. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** True once the element has been at least `threshold` visible; stays true. */
export function useInView<T extends Element>(threshold = 0.25): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Eases a number toward `target` (from where it currently is) over `ms`.
 * `from` is the start the first time it runs (e.g. 0 for a count-up on first
 * view); pass `null` to render `target` straight away. Under reduced motion
 * it always jumps.
 */
export function useTween(target: number, { ms = 700, from = null, active = true }: { ms?: number; from?: number | null; active?: boolean } = {}): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(from ?? target);
  const current = useRef(value);
  const started = useRef(false);
  useEffect(() => {
    current.current = value;
  }, [value]);
  useEffect(() => {
    if (!active) return;
    const start = !started.current && from !== null ? from : current.current;
    started.current = true;
    if (reduced || start === target) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setValue(start + (target - start) * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced, active, from]);
  return value;
}

/** Same as useTween for a series: every point eases together (charts, sparklines). */
export function useTweenSeries(target: number[], ms = 600): number[] {
  const reduced = useReducedMotion();
  const [values, setValues] = useState(target);
  const current = useRef(values);
  const key = target.join(",");
  useEffect(() => {
    current.current = values;
  }, [values]);
  useEffect(() => {
    const next = key === "" ? [] : key.split(",").map(Number);
    const start = current.current;
    if (reduced || start.length !== next.length || start.every((v, i) => v === next[i])) {
      setValues(next);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = easeOutCubic(Math.min(1, (now - t0) / ms));
      setValues(next.map((v, i) => start[i] + (v - start[i]) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, ms, reduced]);
  return values;
}
