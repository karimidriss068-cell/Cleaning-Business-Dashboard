"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Megaphone,
  Clapperboard,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/creatives", label: "Creatives", icon: Clapperboard },
  { href: "/leads", label: "Leads", icon: Users },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-100",
              active
                ? "bg-[var(--bg-surface)] font-medium text-[var(--text-primary)] before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[2px] before:rounded-full before:bg-[var(--accent-primary)] before:content-['']"
                : "text-muted-foreground hover:bg-[var(--bg-surface)] hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active && "text-[var(--accent-primary)]",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
