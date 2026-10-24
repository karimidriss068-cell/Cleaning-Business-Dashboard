"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Side sheet: right edge on desktop (440px), bottom sheet on phones.
 * radius-lg on the inner edge, elevation 3 (DESIGN.md section 10).
 */
export function Drawer({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger render={trigger} />}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] duration-slow data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col border-hairline glass text-popover-foreground shadow-e3 outline-none duration-slow ease-standard",
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-lg border-t pb-[env(safe-area-inset-bottom)]",
            "md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:max-h-none md:w-[440px] md:rounded-t-none md:rounded-l-lg md:border-t-0 md:border-l md:pb-0",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 md:data-open:slide-in-from-bottom-0 md:data-open:slide-in-from-right-4",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4 md:data-closed:slide-out-to-bottom-0 md:data-closed:slide-out-to-right-4",
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-heading text-xl font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-0.5 text-sm text-ink-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
              <XIcon />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</footer>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
