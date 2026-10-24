"use client";

import { cn } from "@/lib/utils";
import { defaultDirection, directionIds, directions, type DirectionId } from "@/config/brand";
import { DIRECTION_STORAGE_KEY } from "@/lib/theme/direction";
import { useIsClient, useStoredChoice } from "@/hooks/use-stored-choice";

/**
 * Temporary switch between the three visual directions while the owner picks
 * one (DESIGN.md section 1). Remove it, and the unused directions, after the
 * choice is made.
 */
export function DirectionSwitcher({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [value, setValue] = useStoredChoice<DirectionId>(DIRECTION_STORAGE_KEY, directionIds, defaultDirection);
  const isClient = useIsClient();

  function choose(next: DirectionId) {
    setValue(next);
    document.documentElement.setAttribute("data-direction", next);
  }

  return (
    <div role="radiogroup" aria-label="Visual direction" className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-raised/70 p-0.5", className)}>
      {directionIds.map((id) => {
        const selected = isClient && value === id;
        const swatch = directions[id].palettes.dark;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={directions[id].label}
            title={directions[id].label}
            onClick={() => choose(id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium transition-colors duration-fast",
              selected ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink",
            )}
          >
            <span aria-hidden className="size-3 rounded-full ring-1 ring-white/15" style={{ background: `linear-gradient(135deg, ${swatch.surfaceRaised} 0 50%, ${swatch.accent} 50% 100%)` }} />
            {!compact && <span>{directions[id].label.split(" & ")[0]}</span>}
          </button>
        );
      })}
    </div>
  );
}
