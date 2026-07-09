"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AppNav } from "@/components/app-nav";

/**
 * The sidebar (`app-nav.tsx`) is hidden below `md` with no replacement —
 * this is the replacement. Same nav links, opened from a hamburger button
 * in a small top bar that only renders on narrow viewports.
 */
export function MobileNav({ alertCount = 0 }: { alertCount?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
      <span className="font-heading text-lg font-bold tracking-tight text-primary">
        MAKI <span className="font-light text-muted-foreground">Ops</span>
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          }
        />
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Menu</DialogTitle>
          </DialogHeader>
          <div onClick={() => setOpen(false)}>
            <AppNav alertCount={alertCount} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
