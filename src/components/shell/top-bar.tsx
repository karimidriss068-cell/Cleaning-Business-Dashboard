"use client";

import { Search } from "lucide-react";
import { openCommandPalette } from "@/components/system/command-palette";
import { ThemeToggle } from "@/components/system/theme-toggle";
import { DirectionSwitcher } from "@/components/system/direction-switcher";

/** Desktop top bar: search / jump (Cmd+K) and the compact appearance controls (saved per member). */
export function TopBar() {
  return (
    <header className="sticky top-3 z-20 mx-3 mt-3 hidden h-14 items-center justify-between gap-4 rounded-lg border border-hairline glass-sidebar px-3 md:flex">
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Search or jump to (Command K)"
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-sm border border-hairline glass-field px-3 text-sm text-ink-muted transition-colors duration-fast hover:border-border-input hover:text-ink"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd className="rounded-xs border border-hairline px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
      </button>
      <div className="flex items-center gap-2">
        <DirectionSwitcher compact persist />
        <ThemeToggle persist />
      </div>
    </header>
  );
}
