"use client";

import { useCallback, useSyncExternalStore } from "react";

// A per-browser remembered choice (density, sidebar collapsed, ...). Reads
// localStorage through useSyncExternalStore so there's no setState-in-effect
// and the server render falls back cleanly. Storage can be unavailable
// (private mode, blocked site data); every access is guarded.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useStoredChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage unavailable: the choice just won't persist.
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, setValue];
}

/** True after hydration; false during the server render. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
