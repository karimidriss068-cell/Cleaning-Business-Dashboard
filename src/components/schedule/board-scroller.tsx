"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The board's scroll frame. On load it scrolls so the first thing that matters
 * (the current time on today, otherwise the earliest visit) sits near the top,
 * instead of opening on an empty morning. `targetPx` is measured from the top
 * of the time grid.
 */
export function BoardScroller({ targetPx, headerPx, className, children }: { targetPx: number | null; headerPx: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (targetPx === null || !ref.current) return;
    ref.current.scrollTop = Math.max(0, headerPx + targetPx - 96);
  }, [targetPx, headerPx]);
  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
