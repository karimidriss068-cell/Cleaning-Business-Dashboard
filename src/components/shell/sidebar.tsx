"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, navFor, type MemberRole } from "@/config/navigation";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { BrandLockup } from "@/components/system/brand-mark";
import { ThemeToggle } from "@/components/system/theme-toggle";
import { openCommandPalette } from "@/components/system/command-palette";
import { signOut } from "@/app/(app)/actions";

/**
 * Desktop/tablet sidebar (DESIGN.md section 9): navy in both themes, icons
 * only from 768px, expanded from 1280px unless collapsed (remembered).
 */
// Takes the role (a plain string) rather than nav items: items carry icon
// components, which can't be passed from the server layout.
export function Sidebar({ role, userName, roleLabel }: { role: MemberRole | null; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const items = navFor(role);
  const [state, setState] = useStoredChoice("kc:sidebar", ["expanded", "collapsed"] as const, "expanded");
  const expanded = state === "expanded";
  // Labels show only on wide screens with the sidebar expanded.
  const label = expanded ? "hidden xl:inline" : "hidden";

  return (
    <aside
      data-state={state}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-slow ease-standard md:flex dark:border-r dark:border-border",
        expanded ? "w-16 xl:w-[232px]" : "w-16",
      )}
    >
      <div className={cn("flex h-14 items-center px-[18px]", expanded && "xl:px-4")}>
        <Link href="/command-center" aria-label="Command Center" className="rounded-sm">
          <BrandLockup tone="sidebar" collapsed className={cn(expanded && "xl:hidden")} />
          {expanded && <BrandLockup tone="sidebar" className="hidden xl:flex" />}
        </Link>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search (Command K)"
          title="Search (⌘K)"
          className="flex h-9 w-full items-center gap-2.5 rounded-sm bg-sidebar-accent px-2.5 text-sm text-sidebar-muted transition-colors duration-fast hover:text-sidebar-foreground"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className={cn(label, "flex-1 text-left")}>Search</span>
          <kbd className={cn(label, "font-mono text-[11px]")}>⌘K</kbd>
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-sm px-2.5 text-sm font-medium transition-colors duration-fast",
                    active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className={cn(label, "truncate")}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-sidebar-border px-3 py-3">
        <div className={cn(label, "space-y-2")}>
          <ThemeToggle tone="sidebar" />
          <div className="min-w-0 px-1">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-[12px] text-sidebar-muted">{roleLabel}</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            className="flex h-9 w-full items-center gap-3 rounded-sm px-2.5 text-sm text-sidebar-muted transition-colors duration-fast hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span className={label}>Sign out</span>
          </button>
        </form>
        <button
          type="button"
          onClick={() => setState(expanded ? "collapsed" : "expanded")}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="hidden h-9 w-full items-center gap-3 rounded-sm px-2.5 text-sm text-sidebar-muted transition-colors duration-fast hover:bg-sidebar-accent/60 hover:text-sidebar-foreground xl:flex"
        >
          {expanded ? <ChevronsLeft className="size-4 shrink-0" aria-hidden /> : <ChevronsRight className="size-4 shrink-0" aria-hidden />}
          <span className={label}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
