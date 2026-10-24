"use client";

import { Rows3, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import type { Density } from "@/config/brand";

const DENSITIES = ["comfortable", "compact"] as const satisfies readonly Density[];

/** Segmented comfortable/compact switch (DESIGN.md section 8). */
export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div role="radiogroup" aria-label="Row density" className="inline-flex rounded-full border border-border bg-surface-raised p-0.5">
      {DENSITIES.map((d) => {
        const Icon = d === "comfortable" ? Rows3 : Rows4;
        const selected = value === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={d === "comfortable" ? "Comfortable rows" : "Compact rows"}
            title={d === "comfortable" ? "Comfortable" : "Compact"}
            onClick={() => onChange(d)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors duration-fast",
              selected ? "bg-surface text-ink shadow-e1" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Frame for a data table: title bar with actions and a density toggle
 * (remembered per browser), flat surface (elevation 0). Put a <Table> inside;
 * give it containerClassName="max-h-[...]" so its header sticks.
 */
export function DataTable({
  title,
  description,
  actions,
  storageKey = "kc:density",
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [density, setDensity] = useStoredChoice<Density>(storageKey, DENSITIES, "comfortable");
  return (
    <section className={cn("overflow-hidden rounded-md border border-border bg-surface", className)} aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {description && <p className="text-[13px] text-ink-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <DensityToggle value={density} onChange={setDensity} />
        </div>
      </header>
      <div data-density={density}>{children}</div>
    </section>
  );
}
