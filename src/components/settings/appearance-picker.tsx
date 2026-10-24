"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { directionIds, directions, type DirectionId } from "@/config/brand";
import { useAppearance } from "@/hooks/use-appearance";
import { useIsClient } from "@/hooks/use-stored-choice";
import { Sparkline } from "@/components/system/sparkline";
import { StatusPill } from "@/components/system/status-pill";
import type { ThemeChoice } from "@/lib/theme/preferences";

const THEMES: { value: ThemeChoice; label: string; hint: string; Icon: typeof Sun }[] = [
  { value: "dark", label: "Dark", hint: "Recommended", Icon: Moon },
  { value: "light", label: "Light", hint: "Bright rooms", Icon: Sun },
  { value: "system", label: "System", hint: "Follows your device", Icon: Monitor },
];

/**
 * A miniature Command Center in one direction. Tokens scope to the subtree via
 * data-direction, and its light/dark follows the page through CSS alone.
 */
function Preview({ id }: { id: DirectionId }) {
  return (
    <div aria-hidden data-direction={id} className="relative overflow-hidden rounded-md border border-hairline bg-background p-3 text-foreground">
      <div aria-hidden className="pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-brand/20 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <span className="font-heading text-[13px] font-semibold tracking-[0.02em]">Command Center</span>
        <span className="h-5 w-12 rounded-full bg-primary" />
      </div>
      <div className="relative mt-3 rounded-sm border border-hairline bg-surface surface-layer p-2.5">
        <div className="text-[9px] font-semibold tracking-[0.12em] text-ink-muted uppercase">Revenue</div>
        <div className="mt-1 flex items-end justify-between">
          <span className="font-heading text-[22px] leading-6 font-medium tabular text-glow">$48,215</span>
          <Sparkline values={[4, 6, 5, 9, 8, 12, 14]} width={64} height={22} />
        </div>
      </div>
      <div className="relative mt-2 flex flex-wrap gap-1">
        <StatusPill tone="info" className="h-5 px-2 text-[10px]">Scheduled</StatusPill>
        <StatusPill tone="success" className="h-5 px-2 text-[10px]">Paid</StatusPill>
        <StatusPill tone="secondary" className="h-5 px-2 text-[10px]">Quoted</StatusPill>
      </div>
    </div>
  );
}

/**
 * Settings → Appearance: pick a visual direction (live previews in your
 * current light/dark theme) and a theme. Saved to your account.
 */
export function AppearancePicker() {
  const { direction, theme, setDirection, setTheme, pending } = useAppearance({ persist: true });
  const isClient = useIsClient();

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="font-heading text-lg font-medium text-ink">Visual direction</legend>
        <p className="mt-1 text-sm text-ink-muted">Each comes in dark and light. Your choice is saved to your account and follows you to any device.</p>
        <div role="radiogroup" aria-label="Choose a visual direction" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {directionIds.map((id, i) => {
            const selected = isClient && direction === id;
            const d = directions[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={d.label}
                aria-describedby={`direction-${id}-mood`}
                onClick={() => setDirection(id)}
                className={cn(
                  "kc-enter group rounded-lg border bg-surface surface-layer p-3 text-left shadow-e1 transition-[border-color,box-shadow,transform] duration-base ease-standard hover:-translate-y-0.5",
                  selected ? "border-brand/70 shadow-[0_0_0_1px_var(--kc-accent),0_12px_32px_-12px_var(--kc-glow)]" : "border-hairline hover:border-border-input",
                )}
                style={{ "--i": i } as React.CSSProperties}
              >
                <Preview id={id} />
                <div className="mt-3 flex items-start justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{d.label}</div>
                    <div id={`direction-${id}-mood`} className="text-[13px] text-ink-muted">{d.mood}</div>
                    <div className="mt-1 text-[12px] text-ink-muted">
                      {d.fonts.display} · {d.fonts.body}
                    </div>
                  </div>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-fast",
                      selected ? "border-brand bg-primary text-primary-foreground" : "border-border-input text-transparent",
                    )}
                  >
                    <Check className="size-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-heading text-lg font-medium text-ink">Theme</legend>
        <div role="radiogroup" aria-label="Choose a theme" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {THEMES.map(({ value, label, hint, Icon }) => {
            const selected = isClient && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex items-center gap-3 rounded-md border bg-surface px-4 py-3 text-left transition-[border-color,box-shadow] duration-fast",
                  selected ? "border-brand/70 shadow-[0_0_0_1px_var(--kc-accent)]" : "border-hairline hover:border-border-input",
                )}
              >
                <Icon className={cn("size-5", selected ? "text-brand-text" : "text-ink-muted")} aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-ink">{label}</span>
                  <span className="block text-[12px] text-ink-muted">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-[12px] text-ink-muted" aria-live="polite">{pending ? "Saving…" : "Changes save automatically."}</p>
    </div>
  );
}
