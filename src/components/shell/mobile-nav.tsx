"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MoreHorizontal, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActive, navFor, type MemberRole } from "@/config/navigation";
import { BrandLockup } from "@/components/system/brand-mark";
import { ThemeToggle } from "@/components/system/theme-toggle";
import { Drawer } from "@/components/system/drawer";
import { openCommandPalette } from "@/components/system/command-palette";
import { DirectionSwitcher } from "@/components/system/direction-switcher";
import { signOut } from "@/app/(app)/actions";

/** Phone top bar: brand and search. */
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-hairline glass-sidebar px-4 md:hidden">
      <Link href="/command-center" aria-label="Command Center">
        <BrandLockup />
      </Link>
      <div className="flex items-center gap-1">
      <DirectionSwitcher compact persist />
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Search"
        className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        <Search className="size-5" aria-hidden />
      </button>
      </div>
    </header>
  );
}

/**
 * One-handed bottom tab bar for phones (DESIGN.md section 9): up to four tabs
 * plus "More", labels always visible, 64px + safe-area inset.
 */
export function MobileTabBar({ role, userName, roleLabel }: { role: MemberRole | null; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  const items = navFor(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = items.filter((i) => i.tab).slice(0, 4);
  const rest = items.filter((i) => !tabs.includes(i));
  const moreActive = rest.some((i) => isActive(pathname, i.href));

  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm text-[11px] font-medium transition-colors duration-fast",
      active ? "text-brand-text before:absolute before:top-0 before:h-0.5 before:w-8 before:rounded-full before:bg-brand before:shadow-[0_0_10px_var(--kc-glow)]" : "text-ink-muted",
    );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline glass-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch gap-1 px-2 py-1.5">
        {tabs.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex flex-1">
              <Link href={item.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <Icon className="size-6" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                {item.short}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button type="button" onClick={() => setMoreOpen(true)} className={tabClass(moreActive)} aria-haspopup="dialog">
            <MoreHorizontal className="size-6" aria-hidden />
            More
          </button>
        </li>
      </ul>

      <Drawer open={moreOpen} onOpenChange={setMoreOpen} title="More" description={`${userName} · ${roleLabel}`}>
        <ul className="-mx-2 space-y-1">
          {rest.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-sm px-3 text-[15px] font-medium",
                    active ? "bg-surface-raised text-brand-text" : "text-ink hover:bg-surface-raised",
                  )}
                >
                  <Icon className="size-5 text-ink-muted" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
          <span className="text-sm text-ink-muted">Theme</span>
          <ThemeToggle persist />
        </div>
        <form action={signOut} className="mt-4">
          <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-sm px-1 text-[15px] font-medium text-ink hover:bg-surface-raised">
            <LogOut className="size-5 text-ink-muted" aria-hidden />
            Sign out
          </button>
        </form>
      </Drawer>
    </nav>
  );
}
