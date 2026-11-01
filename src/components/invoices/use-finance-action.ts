"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ZodError } from "zod";
import type { FinanceResult } from "@/lib/schemas/finance";

/**
 * Runs a finance server action: toast the outcome, then refresh the page's
 * data. A stale result also refreshes, so the screen shows what the other
 * person changed.
 */
export function useFinanceAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run<T extends object>(fn: () => Promise<FinanceResult<T>>, success: string | ((r: { ok: true } & T) => string), after?: (r: { ok: true } & T) => void, onError?: (message: string) => void) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(typeof success === "function" ? success(r) : success);
        router.refresh();
        after?.(r);
        return;
      }
      toast.error(r.message);
      onError?.(r.message);
      if (r.code === "stale") router.refresh();
    });
  }
  return { run, pending };
}

/** First zod issue per field, for inline messages next to inputs. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[issue.path.length - 1] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
