"use client";

import { cn } from "@/lib/utils";
import { directionIds, directions } from "@/config/brand";
import { useIsClient } from "@/hooks/use-stored-choice";
import { useAppearance } from "@/hooks/use-appearance";

/**
 * Compact visual-direction switcher for the top bars and login. Saves to the
 * member's preferences when `persist` (signed in); otherwise this browser only.
 * The full picker with previews lives in Settings → Appearance.
 */
export function DirectionSwitcher({ className, compact = false, persist = false }: { className?: string; compact?: boolean; persist?: boolean }) {
  const { direction, setDirection } = useAppearance({ persist });
  const isClient = useIsClient();

  return (
    <div role="radiogroup" aria-label="Visual direction" className={cn("inline-flex items-center gap-0.5 rounded-full border border-hairline bg-surface-raised/70 p-0.5", className)}>
      {directionIds.map((id) => {
        const selected = isClient && direction === id;
        const swatch = directions[id].palettes.dark;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={directions[id].label}
            title={directions[id].label}
            onClick={() => setDirection(id)}
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
