"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 10_000;

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(id);
}

/** The current time, refreshed every 10 seconds; null on the server and until hydrated. */
export function useNow(): Date | null {
  const tick = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => 0,
  );
  return tick === 0 ? null : new Date(tick);
}
