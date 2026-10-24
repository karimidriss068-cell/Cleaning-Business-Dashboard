"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { defaultDirection, directionIds, type DirectionId } from "@/config/brand";
import { DIRECTION_STORAGE_KEY } from "@/lib/theme/direction";
import { DIRECTION_COOKIE, DIRECTION_COOKIE_MAX_AGE, type ThemeChoice } from "@/lib/theme/preferences";
import { savePreferences } from "@/app/actions/preferences";
import { useStoredChoice } from "./use-stored-choice";

/** Applies a direction in this browser: attribute (instant), cookie (next server render), localStorage. */
export function applyDirectionLocally(direction: DirectionId) {
  document.documentElement.setAttribute("data-direction", direction);
  document.documentElement.setAttribute("data-direction-source", "cookie");
  document.cookie = `${DIRECTION_COOKIE}=${direction}; path=/; max-age=${DIRECTION_COOKIE_MAX_AGE}; samesite=lax`;
  try {
    window.localStorage.setItem(DIRECTION_STORAGE_KEY, direction);
  } catch {
    // Storage unavailable: the cookie still carries the choice.
  }
}

/**
 * The member's appearance and setters. Changes apply instantly, persist to
 * user_preferences when `persist` (signed in), and refresh the server render
 * so the new direction's fonts load.
 */
export function useAppearance({ persist }: { persist: boolean }) {
  const router = useRouter();
  const { theme, setTheme: setNextTheme } = useTheme();
  const [direction, setStoredDirection] = useStoredChoice<DirectionId>(DIRECTION_STORAGE_KEY, directionIds, defaultDirection);
  const [pending, startTransition] = useTransition();

  const save = useCallback(
    (update: { direction?: DirectionId; theme?: ThemeChoice }) => {
      if (!persist) return;
      startTransition(async () => {
        const result = await savePreferences(update);
        if (!result.ok) toast.error("Appearance not saved to your account", { description: `${result.error}. It's kept in this browser.` });
      });
    },
    [persist],
  );

  const setDirection = useCallback(
    (next: DirectionId) => {
      applyDirectionLocally(next);
      setStoredDirection(next);
      save({ direction: next });
      router.refresh();
    },
    [router, save, setStoredDirection],
  );

  const setTheme = useCallback(
    (next: ThemeChoice) => {
      setNextTheme(next);
      save({ theme: next });
    },
    [save, setNextTheme],
  );

  return { direction, theme: (theme ?? "dark") as ThemeChoice, setDirection, setTheme, pending };
}
