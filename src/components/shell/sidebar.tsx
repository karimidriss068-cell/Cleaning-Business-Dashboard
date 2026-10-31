"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, navFor, type MemberRole, type NavItem } from "@/config/navigation";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { BrandLockup } from "@/components/system/brand-mark";
import { signOut } from "@/app/(app)/actions";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

/**
 * Desktop/tablet sidebar (DESIGN.md section 9): a floating glass rail with
 * grouped navigation, an accent indicator on the active item and a member card.
 * Icons only from 768px, expanded from 1280px unless collapsed (remembered).
 * Takes the role (a plain string), not nav items: items carry icon components,
 * which can't be passed from the server layout.
 */
export function Sidebar({ role, userName, roleLabel }: { role: MemberRole | null; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const items = navFor(role);
  const [state, setState] = useStoredChoice("kc:sidebar", ["expanded", "collapsed"] as const, "expanded");
  const expanded = state === "expanded";
  const label = expanded ? "hidden xl:inline" : "hidden";
  const sections = [...new Set(items.map((i) => i.section))];

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          title={item.label}
          className={cn(
            "relative flex h-10 items-center gap-3 rounded-sm px-2.5 text-sm font-medium transition-colors duration-fast",
            active ? "bg-surface-raised/80 text-ink" : "text-ink-muted hover:bg-surface-raised/50 hover:text-ink",
          )}
        >
          {active && <span aria-hidden className="absolute inset-y-2 -left-3 w-[3px] rounded-r-full bg-brand shadow-[0_0_10px_var(--kc-glow)]" />}
          <Icon className={cn("size-[18px] shrink-0", active && "text-brand-text")} aria-hidden strokeWidth={1.75} />
          <span className={cn(label, "truncate")}>{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside
      data-state={state}
      className={cn(
        "sticky top-3 z-20 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col rounded-lg border border-hairline glass-sidebar transition-[width] duration-slow ease-standard md:flex",
        expanded ? "w-16 xl:w-[244px]" : "w-16",
      )}
    >
      <div className={cn("flex h-16 items-center px-[17px]", expanded && "xl:px-5")}>
        <Link href="/command-center" aria-label="Command Center" className="rounded-sm">
          <BrandLockup collapsed className={cn(expanded && "xl:hidden")} />
          {expanded && <BrandLockup className="hidden xl:flex" />}
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section} className="mb-4">
            <div className={cn(label, "mb-1.5 block px-2.5 text-[10px] font-semibold tracking-[0.16em] text-ink-muted uppercase")}>{section}</div>
            <ul className="space-y-0.5">{items.filter((i) => i.section === section).map(renderItem)}</ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-hairline p-3">
        <div className={cn("flex items-center gap-3 rounded-sm px-1.5 py-1.5", !expanded && "justify-center", expanded && "max-xl:justify-center")}>
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised font-heading text-[12px] font-semibold text-brand-text ring-1 ring-brand/40"
          >
            {initials(userName)}
          </span>
          <div className={cn(label, "min-w-0")}>
            <p className="truncate text-sm font-medium text-ink">{userName}</p>
            <p className="truncate text-[12px] text-ink-muted">{roleLabel}</p>
          </div>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            className="flex h-9 w-full items-center gap-3 rounded-sm px-2.5 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface-raised/50 hover:text-ink"
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
          className="hidden h-9 w-full items-center gap-3 rounded-sm px-2.5 text-sm text-ink-muted transition-colors duration-fast hover:bg-surface-raised/50 hover:text-ink xl:flex"
        >
          {expanded ? <ChevronsLeft className="size-4 shrink-0" aria-hidden /> : <ChevronsRight className="size-4 shrink-0" aria-hidden />}
          <span className={label}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
