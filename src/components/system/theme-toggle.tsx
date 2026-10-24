"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useIsClient } from "@/hooks/use-stored-choice";

const OPTIONS = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
  { value: "system", label: "Match system", Icon: Monitor },
] as const;

/** Light / dark / system switch. `tone="sidebar"` for the navy sidebar. */
export function ThemeToggle({ tone = "page", className }: { tone?: "page" | "sidebar"; className?: string }) {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();
  const current = isClient ? (theme ?? "system") : null;
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex rounded-full p-0.5",
        tone === "sidebar" ? "bg-sidebar-accent" : "border border-border bg-surface-raised",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors duration-fast",
              tone === "sidebar"
                ? selected ? "bg-sidebar text-sidebar-primary" : "text-sidebar-muted hover:text-sidebar-foreground"
                : selected ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
