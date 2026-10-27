"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { checklistLabel } from "@/lib/crew";
import { toggleChecklistItem } from "@/app/actions/crew";

type Item = { id: string; label: string; done: boolean };

/** Big tick-off list; ticks save immediately and revert if the server says no. */
export function Checklist({ items: initial, editable }: { items: Item[]; editable: boolean }) {
  const [items, setItems] = useState(initial);
  const done = items.filter((i) => i.done).length;

  async function toggle(item: Item) {
    if (!editable) return;
    const next = !item.done;
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: next } : x)));
    const result = await toggleChecklistItem({ itemId: item.id, done: next });
    if (!result.ok) {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: item.done } : x)));
      toast.error("Task not saved", { description: result.message });
    }
  }

  if (items.length === 0) return <p className="text-[17px] text-crew-muted">No checklist for this service.</p>;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[15px] font-medium text-crew-muted tabular">{checklistLabel(done, items.length)}</span>
        <div role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} className="h-2 w-28 overflow-hidden rounded-full bg-surface-raised">
          <div className="h-full rounded-full bg-brand transition-[width] duration-base ease-standard" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              disabled={!editable}
              onClick={() => toggle(item)}
              className={cn(
                "flex min-h-14 w-full items-center gap-4 rounded-md border px-4 py-3 text-left text-[17px] transition-colors duration-fast",
                item.done ? "border-brand/50 bg-info-soft text-ink" : "border-hairline bg-surface-raised/60 text-ink",
                editable && "active:bg-info-soft",
              )}
            >
              <span aria-hidden className={cn("flex size-7 shrink-0 items-center justify-center rounded-xs border-2", item.done ? "border-brand bg-primary text-primary-foreground" : "border-border-input")}>
                {item.done && <Check className="size-5" strokeWidth={3} />}
              </span>
              <span className={cn(item.done && "text-crew-muted line-through decoration-1")}>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
