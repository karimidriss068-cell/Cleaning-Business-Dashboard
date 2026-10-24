"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { LoadedPreferences } from "@/lib/theme/load-preferences";
import { DIRECTION_COOKIE } from "@/lib/theme/preferences";
import { applyDirectionLocally } from "@/hooks/use-appearance";

function cookieValue(name: string): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.split("=")[1];
}

/**
 * Brings this browser in line with the member's saved appearance (another
 * device may have changed it). If the read failed or nothing is saved yet,
 * the local choice (cookie / localStorage / default) stays as is. Renders nothing.
 */
export function AppearanceSync({ loaded }: { loaded: LoadedPreferences }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // Sync once per page load. Later renders (e.g. the refresh after a direction
  // change) carry preferences read before the user's latest click, so applying
  // them again would undo it; from here on, local choices are authoritative.
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    if (loaded.status === "saved") {
      const { direction, theme: savedTheme } = loaded.preferences;
      if (cookieValue(DIRECTION_COOKIE) !== direction || document.documentElement.getAttribute("data-direction") !== direction) {
        applyDirectionLocally(direction);
        router.refresh(); // re-render with this direction's fonts
      }
      if (theme !== savedTheme) setTheme(savedTheme);
      return;
    }
    // No saved row (or the read failed): if the boot script applied a
    // localStorage choice without a cookie, mirror it so its fonts load.
    const current = document.documentElement.getAttribute("data-direction");
    if (current && cookieValue(DIRECTION_COOKIE) !== current && document.documentElement.getAttribute("data-direction-source") === "default") {
      applyDirectionLocally(current as Parameters<typeof applyDirectionLocally>[0]);
      router.refresh();
    }
    // Runs once (see synced above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return null;
}
