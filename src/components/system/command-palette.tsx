"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Command = {
  id: string;
  label: string;
  group: "Go to" | "Create" | "Recent";
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
  keywords?: string;
  hint?: string;
};

const OPEN_EVENT = "kc:open-command-palette";

/** Opens the palette from anywhere (e.g. the sidebar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const GROUP_ORDER: Command["group"][] = ["Recent", "Go to", "Create"];

/**
 * Cmd+K / Ctrl+K command palette (DESIGN.md section 10). Combobox pattern:
 * typing filters, arrow keys move, Enter runs, Esc closes.
 */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setActive(0);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) {
            setQuery("");
            setActive(0);
          }
          return !o;
        });
      }
    };
    const onOpen = () => {
      setQuery("");
      setActive(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? commands.filter((c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q))
      : commands;
    return GROUP_ORDER.flatMap((g) => matches.filter((c) => c.group === g));
  }, [commands, query]);

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    setOpen(false);
    if (cmd.href) router.push(cmd.href);
    else cmd.onSelect?.();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[rgb(10_28_41/0.5)] duration-base data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed top-[12vh] left-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-e2 outline-none duration-base ease-standard data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2 data-closed:animate-out data-closed:fade-out-0 md:top-[20vh]">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search pages and actions…"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
              aria-label="Search pages and actions"
              className="h-12 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
            />
            <kbd className="hidden rounded-xs border border-border px-1.5 py-0.5 font-mono text-[11px] text-ink-muted sm:block">Esc</kbd>
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-muted">No matches for “{query}”.</li>}
            {results.map((cmd, i) => {
              const header = i === 0 || results[i - 1].group !== cmd.group ? cmd.group : null;
              const Icon = cmd.icon;
              return (
                <li key={cmd.id} role="presentation">
                  {header && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-muted uppercase">{header}</div>}
                  <div
                    id={`${listId}-${cmd.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(cmd)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink",
                      i === active && "bg-surface-raised",
                    )}
                  >
                    {Icon && <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />}
                    <span className="flex-1 truncate">{cmd.label}</span>
                    {cmd.hint && <span className="text-[13px] text-ink-muted">{cmd.hint}</span>}
                    {i === active && <CornerDownLeft className="size-3.5 text-ink-muted" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden items-center gap-4 border-t border-border px-4 py-2 text-[12px] text-ink-muted sm:flex">
            <span><kbd className="font-mono">↑↓</kbd> move</span>
            <span><kbd className="font-mono">Enter</kbd> open</span>
            <span><kbd className="font-mono">Esc</kbd> close</span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
