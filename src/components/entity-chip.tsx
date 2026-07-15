import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pill-shaped reference to an account/campaign/creative/script — used
 * anywhere an entity name is mentioned inline in prose (e.g. the Insights
 * answer headline). Deliberately NOT styled like an underlined hyperlink:
 * it should read as a label first, a link second.
 */
export function EntityChip({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "mx-0.5 inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 align-middle text-[0.62em] font-medium tracking-wide text-cream-rich transition-colors",
        "border-[color-mix(in_srgb,var(--accent-primary)_55%,transparent)] hover:border-[var(--accent-bright)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
