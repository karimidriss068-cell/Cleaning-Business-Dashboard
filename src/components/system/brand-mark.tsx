import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";

/**
 * The keystone mark: the wedge at the top of an arch that holds it together.
 * Teal wedge with a mist center line; reads at 16px.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className={cn("shrink-0", className)}>
      {title && <title>{title}</title>}
      <path d="M5 5h22l-5 22H10L5 5Z" fill="var(--kc-accent)" />
      <path d="M16 10v12" stroke="var(--kc-sidebar-text)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Mark plus wordmark. `tone="sidebar"` for the navy sidebar in both themes. */
export function BrandLockup({ collapsed = false, tone = "page", className }: { collapsed?: boolean; tone?: "page" | "sidebar"; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="size-7" />
      {!collapsed && (
        <span className={cn("font-heading text-xl leading-none font-semibold tracking-wide", tone === "sidebar" ? "text-sidebar-foreground" : "text-ink")}>
          {brand.name}
        </span>
      )}
    </span>
  );
}
