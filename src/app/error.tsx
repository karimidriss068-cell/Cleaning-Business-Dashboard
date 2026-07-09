"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent-bright)]/30 bg-[color-mix(in_srgb,var(--accent-bright)_14%,transparent)]">
        <TriangleAlert className="h-6 w-6 text-[var(--accent-bright)]" />
      </div>
      <div className="space-y-1">
        <p className="font-heading text-3xl font-medium tracking-tight">
          Something went wrong
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          An unexpected error occurred. Try again, or refresh the page.
        </p>
      </div>
      <Button size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
