import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";

/**
 * The keystone mark: the wedge at the top of an arch that holds it together.
 * Accent wedge with a canvas-colored center line and a soft glow; reads at 16px.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} className={cn("shrink-0 drop-shadow-[0_0_10px_var(--kc-glow)]", className)}>
      {title && <title>{title}</title>}
      <path d="M5 5h22l-5 22H10L5 5Z" fill="var(--kc-accent)" />
      <path d="M16 10v12" stroke="var(--kc-canvas)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Mark plus wordmark in the direction's display face. */
export function BrandLockup({ collapsed = false, className }: { collapsed?: boolean; tone?: "page" | "sidebar"; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="size-7" />
      {!collapsed && <span className="font-heading text-[17px] leading-none font-semibold tracking-[0.04em] text-ink">{brand.name}</span>}
    </span>
  );
}
