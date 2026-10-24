import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { brand } from "@/config/brand";
import { BrandLockup } from "@/components/system/brand-mark";
import { ThemeToggle } from "@/components/system/theme-toggle";
import { DesignCommandPalette, Showcase } from "./showcase";

export const metadata: Metadata = { title: `Design system · ${brand.name}`, robots: { index: false } };

// Dev-only reference for DESIGN.md: every component in both themes.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 md:px-6">
        <div className="flex items-center gap-4">
          <BrandLockup />
          <span className="hidden text-sm text-ink-muted sm:inline">Design system · dev only</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[13px] text-ink-muted md:inline">Overlays follow the page theme</span>
          <ThemeToggle />
        </div>
      </header>
      <div className="grid grid-cols-1 2xl:grid-cols-2">
        <Showcase theme="light" />
        <Showcase theme="dark" />
      </div>
      <DesignCommandPalette />
    </div>
  );
}
